/**
 * Receipt scanning with Claude — shared by the /api/scan route and the
 * offline eval script (scripts/scan-eval.ts). Server-only.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { CATEGORIES, PAYMENT_METHODS, PLATFORMS } from "./constants";
import { SCAN_PROMPT_VERSION, SCAN_SYSTEM_PROMPT } from "./scan-prompt";
import type { ScanResult } from "./types";

export const SCAN_MODEL = "claude-opus-5-5";
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

export interface ScanContext {
  tripCode?: string;
  memberCashRate?: number | null;
  today: string;
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
  | { ok: true; claims: ScanResult[]; usage: Anthropic.Usage; promptVersion: string }
  | { ok: false; status: number; error: string };

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
  ]
    .filter(Boolean)
    .join(" ");

  try {
    const msg = await client.messages.parse({
      model: SCAN_MODEL,
      max_tokens: 6000,
      output_config: { effort: "high", format: zodOutputFormat(ScanSchema) },
      system: [{ type: "text", text: SCAN_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: [...parts, { type: "text", text: userText }] }],
    });

    if (msg.stop_reason === "refusal") {
      return { ok: false, status: 422, error: "The AI declined to read these images. Please type the claim manually." };
    }
    const out = msg.parsed_output;
    if (!out || !out.claims.length) return { ok: false, status: 502, error: "AI returned an unreadable result. Try again or type manually." };

    const claims: ScanResult[] = out.claims.map((c) => ({
      ...c,
      date: c.date && /^\d{4}-\d{2}-\d{2}$/.test(c.date) ? c.date : null,
      rate: c.rate && c.rate > 0 ? Number(c.rate.toFixed(8)) : null,
      merchant: c.merchant ? c.merchant.replace(/\s*\(\*\*[^)]*\)\s*$/, "").trim() || null : null,
    }));
    return { ok: true, claims, usage: msg.usage, promptVersion: SCAN_PROMPT_VERSION };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, status: 500, error: "AI not configured (bad API key)" };
    if (err instanceof Anthropic.RateLimitError) return { ok: false, status: 429, error: "AI is busy, try again in a moment" };
    if (err instanceof Anthropic.BadRequestError) return { ok: false, status: 400, error: `AI rejected the request: ${err.message}` };
    if (err instanceof Anthropic.APIConnectionError) return { ok: false, status: 502, error: "Could not reach the AI service" };
    if (err instanceof Anthropic.APIError) return { ok: false, status: 502, error: `AI error ${err.status ?? ""}: ${err.message}` };
    throw err;
  }
}
