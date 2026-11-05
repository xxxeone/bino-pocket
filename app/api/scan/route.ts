import { buildHints, MAX_IMAGES, parseDataUrl, scanImages, type Media } from "@/lib/scan";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 90;

interface Body {
  images?: { dataUrl?: string }[];
  context?: { tripId?: string; tripCode?: string; memberCashRate?: number | null; today?: string; verify?: boolean };
}

/** POST /api/scan → { claims: ScanResult[], result: claims[0], meta } — one claim per purchase, read twice (self-audited). */
export async function POST(req: Request) {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "AI scanning is not configured yet (ANTHROPIC_API_KEY missing)" }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const images = body.images ?? [];
  if (!images.length) return Response.json({ error: "No images" }, { status: 400 });
  if (images.length > MAX_IMAGES) return Response.json({ error: `Max ${MAX_IMAGES} images per scan` }, { status: 400 });

  const parsed: { media: Media; data: string }[] = [];
  for (const img of images) {
    const p = parseDataUrl(img.dataUrl ?? "");
    if ("error" in p) return Response.json({ error: p.error }, { status: p.status });
    parsed.push(p);
  }

  const ctx = body.context ?? {};
  const today = ctx.today && /^\d{4}-\d{2}-\d{2}$/.test(ctx.today) ? ctx.today : new Date().toISOString().slice(0, 10);

  // Team memory: how merchants were labelled earlier in this trip (RLS limits this to what the caller may see).
  let hints = "";
  if (ctx.tripId) {
    const { data: prev } = await sb
      .from("fin_claims")
      .select("merchant,description,category,platform,purpose,kind")
      .eq("trip_id", ctx.tripId)
      .neq("status", "rejected")
      .order("created_at", { ascending: false })
      .limit(80);
    hints = buildHints(prev ?? []);
  }

  try {
    const r = await scanImages(parsed, { tripCode: ctx.tripCode, memberCashRate: ctx.memberCashRate, today, hints, verify: ctx.verify });
    if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
    return Response.json({ result: r.claims[0], claims: r.claims, meta: { prompt: r.promptVersion, usage: r.usage, passes: r.passes } });
  } catch (err) {
    console.error("scan failed", err);
    return Response.json({ error: "Scan failed" }, { status: 500 });
  }
}
