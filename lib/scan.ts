/**
 * Receipt scanning with Claude — shared by the /api/scan route and the
 * offline eval script (scripts/scan-eval.ts). Server-only.
 *
 * Reflexive flow:
 *   pass 1  read the images → claims
 *   checks  programmatic consistency (rate arithmetic, date sanity, image grouping…)
 *   pass 2  the model audits its own answer against the same images (cached),
 *           guided by the issues found, and returns corrected claims + what it changed
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { CATEGORIES, PAYMENT_METHODS, PLATFORMS } from "./constants";
import { SCAN_PROMPT_VERSION, SCAN_SYSTEM_PROMPT, SCAN_VERIFY_PROMPT } from "./scan-prompt";
import type { ScanCorrection, ScanResult, ScanVerification } from "./types";

/**
 * Models. Haiku 5.5 reads receipts at ~1/40 of Opus' input price; the audit pass
 * escalates to the stronger model only when the checks flag a problem or the
 * first read is not fully confident. Override per environment:
 *   SCAN_MODEL        first read            (default claude-haiku-5-5)
 *   SCAN_AUDIT_MODEL  audit when in doubt   (default claude-opus-5-5)
 */
export const SCAN_MODEL = process.env.SCAN_MODEL || "claude-haiku-5-5";
export const SCAN_AUDIT_MODEL = process.env.SCAN_AUDIT_MODEL || "claude-opus-5-5";
export const MAX_IMAGES = 6;
export const MAX_BYTES = 5 * 1024 * 1024;

const MEDIA = { "image/jpeg": "image/jpeg", "image/png": "image/png", "image/webp": "image/webp" } as const;
export type Media = keyof typeof MEDIA;

const ids = (o: { id: string }[]) => o.map((x) => x.id) as [string, ...string[]];

export const ClaimSchema = z.object({
  image_indexes: z.array(z.number()).describe("0-based indexes of the input images this claim was read from"),
  date: z.string().nullable().describe("YYYY-MM-DD or null when no date is visible"),
  merchant: z.string().nullable(),
  description: z.string(),
  category: z.enum(ids(CATEGORIES)),
  platform: z.enum(ids(PLATFORMS)).nullable(),
  payment_method: z.enum(ids(PAYMENT_METHODS)).nullable(),
  purpose: z.enum(["team", "client", "company"]),
  amount_rmb: z.number().nullable(),
  amount_myr: z.number().nullable(),
  rate: z.number().nullable().describe("CNY per 1 MYR"),
  rate_source: z.enum(["screenshot", "computed"]).nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  notes: z.string().nullable(),
  images: z.array(
    z.object({
      index: z.number(),
      type: z.string(),
      amount: z.number().nullable(),
      currency: z.enum(["RMB", "MYR"]).nullable(),
    }),
  ),
});
export const ScanSchema = z.object({ claims: z.array(ClaimSchema).min(1) });
export const VerifySchema = z.object({
  claims: z.array(ClaimSchema).min(1),
  corrections: z.array(
    z.object({
      claim: z.number().describe("0-based claim index"),
      field: z.string(),
      from: z.string().nullable(),
      to: z.string().nullable(),
      why: z.string(),
    }),
  ),
});

export interface ScanContext {
  tripCode?: string;
  memberCashRate?: number | null;
  today: string;
  /** "Team memory": how this team labelled merchants earlier in the trip. */
  hints?: string;
  /** Run the self-audit pass (default true). */
  verify?: boolean;
}

export function parseDataUrl(dataUrl: string): { media: Media; data: string } | { error: string; status: number } {
  const m = /^data:([a-z0-9/+.-]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) return { error: "Bad image data", status: 400 };
  const media = m[1].toLowerCase();
  if (!(media in MEDIA)) return { error: `Unsupported image type ${media}. Use JPEG, PNG or WebP.`, status: 415 };
  const data = m[2];
  if ((data.length * 3) / 4 > MAX_BYTES) return { error: "Image too large (max 5 MB)", status: 413 };
  return { media: media as Media, data };
}

export type ScanOutcome =
  | { ok: true; claims: ScanResult[]; usage: Anthropic.Usage; promptVersion: string; passes: number; models: string[] }
  | { ok: false; status: number; error: string };

type RawClaim = z.infer<typeof ClaimSchema>;

function normalize(c: RawClaim): ScanResult {
  return {
    ...c,
    image_indexes: c.image_indexes?.length ? c.image_indexes : c.images.map((i) => i.index),
    date: c.date && /^\d{4}-\d{2}-\d{2}$/.test(c.date) ? c.date : null,
    rate: c.rate && c.rate > 0 ? Number(c.rate.toFixed(8)) : null,
    merchant: c.merchant ? c.merchant.replace(/\s*\(\*\*[^)]*\)\s*$/, "").trim() || null : null,
  };
}

/** Programmatic consistency checks between the two passes. Returns human-readable issues. */
export function checkClaims(claims: ScanResult[], imageCount: number, today: string): string[] {
  const issues: string[] = [];
  const seen = new Map<number, number>();
  claims.forEach((c, i) => {
    const n = i + 1;
    const { amount_rmb: rmb, amount_myr: myr, rate } = c;
    if (rmb != null && myr != null && myr > 0) {
      const ratio = rmb / myr;
      if (rate && Math.abs(ratio - rate) / rate > 0.005)
        issues.push(`Claim ${n}: ¥${rmb} ÷ RM${myr} = ${ratio.toFixed(4)} but the rate is ${rate} — one of the three numbers is misread (comma vs decimal? a dropped digit?).`);
      if (!rate && (ratio < 1.3 || ratio > 1.9)) issues.push(`Claim ${n}: ¥${rmb} ÷ RM${myr} = ${ratio.toFixed(3)} is not a plausible CNY/MYR rate — re-read both amounts.`);
    }
    if (rate && (rate < 1.3 || rate > 1.9)) issues.push(`Claim ${n}: rate ${rate} is outside the plausible 1.3–1.9 range (CNY per 1 MYR).`);
    if (rmb == null && myr == null) issues.push(`Claim ${n}: no amount was read at all.`);
    if (c.date) {
      if (c.date > today) issues.push(`Claim ${n}: date ${c.date} is in the future (today is ${today}) — check day/month order.`);
      const age = (Date.parse(today) - Date.parse(c.date)) / 86400000;
      if (age > 400) issues.push(`Claim ${n}: date ${c.date} is more than a year old — check the year.`);
    }
    if (!c.description.trim()) issues.push(`Claim ${n}: description is empty.`);
    if (c.merchant && /\(\*\*/.test(c.merchant)) issues.push(`Claim ${n}: merchant still carries a "(**x)" mask.`);
    for (const idx of c.image_indexes) seen.set(idx, (seen.get(idx) ?? 0) + 1);
  });
  for (let i = 0; i < imageCount; i++) {
    const k = seen.get(i) ?? 0;
    if (k === 0) issues.push(`Image ${i} is not assigned to any claim.`);
    if (k > 1) issues.push(`Image ${i} is assigned to ${k} claims.`);
  }
  return issues;
}

const sumUsage = (a: Anthropic.Usage, b: Anthropic.Usage): Anthropic.Usage => ({
  ...a,
  input_tokens: a.input_tokens + b.input_tokens,
  output_tokens: a.output_tokens + b.output_tokens,
  cache_creation_input_tokens: (a.cache_creation_input_tokens ?? 0) + (b.cache_creation_input_tokens ?? 0),
  cache_read_input_tokens: (a.cache_read_input_tokens ?? 0) + (b.cache_read_input_tokens ?? 0),
});

/** Run the model over the images. Throws only on programmer error; API errors come back as {ok:false}. */
export async function scanImages(images: { media: Media; data: string }[], ctx: ScanContext, client = new Anthropic()): Promise<ScanOutcome> {
  const parts: Anthropic.ImageBlockParam[] = images.map((p) => ({
    type: "image",
    source: { type: "base64", media_type: p.media, data: p.data },
  }));
  const userText = [
    `Today: ${ctx.today}.`,
    ctx.tripCode ? `Trip: ${ctx.tripCode}.` : "",
    ctx.memberCashRate
      ? `This member exchanged cash at a fixed rate of ${ctx.memberCashRate} CNY per MYR — do NOT use it yourself; leave amount_myr null when only CNY is visible.`
      : "",
    `There are ${parts.length} image(s), indexed 0..${parts.length - 1}. Group them into claims as instructed.`,
    ctx.hints ? `\nTeam memory — how this team labelled merchants earlier in this trip (follow unless the receipt clearly differs):\n${ctx.hints}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  // The whole first turn (system + images + instructions) is cached so the audit pass re-reads it cheaply.
  const firstTurn: Anthropic.MessageParam = {
    role: "user",
    content: [...parts, { type: "text", text: userText, cache_control: { type: "ephemeral" } }],
  };
  const system: Anthropic.TextBlockParam[] = [{ type: "text", text: SCAN_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }];

  try {
    const m1 = await client.messages.parse({
      model: SCAN_MODEL,
      max_tokens: 6000,
      output_config: { effort: "high", format: zodOutputFormat(ScanSchema) },
      system,
      messages: [firstTurn],
    });
    if (m1.stop_reason === "refusal") return { ok: false, status: 422, error: "The AI declined to read these images. Please type the claim manually." };
    if (!m1.parsed_output?.claims.length) return { ok: false, status: 502, error: "AI returned an unreadable result. Try again or type manually." };

    let claims = m1.parsed_output.claims.map(normalize);
    let usage = m1.usage;
    let passes = 1;
    const models = [SCAN_MODEL];
    const issues = checkClaims(claims, images.length, ctx.today);
    let verification: ScanVerification = { checked: false, issues, corrections: [] };

    if (ctx.verify !== false) {
      // Escalate the audit to the stronger model when something looks off.
      const inDoubt = issues.length > 0 || claims.some((c) => c.confidence !== "high");
      const auditModel = inDoubt ? SCAN_AUDIT_MODEL : SCAN_MODEL;
      models.push(auditModel);
      const auditText = issues.length
        ? `${SCAN_VERIFY_PROMPT}\n\nAutomatic checks flagged these problems — resolve each one:\n${issues.map((s) => `- ${s}`).join("\n")}`
        : `${SCAN_VERIFY_PROMPT}\n\nAutomatic checks found no inconsistencies; still re-read every number.`;
      const m2 = await client.messages.parse({
        model: auditModel,
        max_tokens: 6000,
        output_config: { effort: "high", format: zodOutputFormat(VerifySchema) },
        system,
        messages: [firstTurn, { role: "assistant", content: m1.content }, { role: "user", content: auditText }],
      });
      usage = sumUsage(usage, m2.usage);
      passes = 2;
      if (m2.stop_reason !== "refusal" && m2.parsed_output?.claims.length) {
        claims = m2.parsed_output.claims.map(normalize);
        const corrections: ScanCorrection[] = m2.parsed_output.corrections.map((c) => ({
          field: claims.length > 1 ? `claim ${c.claim + 1} ${c.field}` : c.field,
          from: c.from,
          to: c.to,
          why: c.why,
        }));
        verification = { checked: true, issues, corrections };
      }
    }

    claims = claims.map((c) => ({ ...c, verification }));
    return { ok: true, claims, usage, promptVersion: SCAN_PROMPT_VERSION, passes, models };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, status: 500, error: "AI not configured (bad API key)" };
    if (err instanceof Anthropic.RateLimitError) return { ok: false, status: 429, error: "AI is busy, try again in a moment" };
    if (err instanceof Anthropic.BadRequestError) return { ok: false, status: 400, error: `AI rejected the request: ${err.message}` };
    if (err instanceof Anthropic.APIConnectionError) return { ok: false, status: 502, error: "Could not reach the AI service" };
    if (err instanceof Anthropic.APIError) return { ok: false, status: 502, error: `AI error ${err.status ?? ""}: ${err.message}` };
    throw err;
  }
}

/**
 * "Team memory": compact lines describing how merchants were labelled earlier in this trip.
 * Pass the rows from fin_claims (any order, newest first preferred).
 */
export function buildHints(rows: { merchant: string | null; description: string; category: string; platform: string | null; purpose: string; kind: string }[], max = 25): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const r of rows) {
    if (r.kind !== "expense") continue;
    const key = (r.merchant ?? r.description.split(/\s[-·]\s/)[0]).trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    lines.push(`- ${r.merchant ?? r.description} → ${r.category}${r.platform ? `/${r.platform}` : ""}, ${r.purpose}, "${r.description}"`);
    if (lines.length >= max) break;
  }
  return lines.join("\n");
}
