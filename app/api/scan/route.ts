import { MAX_IMAGES, parseDataUrl, scanImages, type Media } from "@/lib/scan";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Body {
  images?: { dataUrl?: string }[];
  context?: { tripCode?: string; memberCashRate?: number | null; today?: string; knownPlatforms?: string[] };
}

/** POST /api/scan → { claims: ScanResult[], result: ScanResult, meta } (one claim per purchase; usually exactly one) */
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
  const raw = body.images ?? [];
  if (!raw.length) return Response.json({ error: "No images" }, { status: 400 });
  if (raw.length > MAX_IMAGES) return Response.json({ error: `Max ${MAX_IMAGES} images per scan` }, { status: 400 });

  const images: { media: Media; data: string }[] = [];
  for (const img of raw) {
    const p = parseDataUrl(img.dataUrl ?? "");
    if ("error" in p) return Response.json({ error: p.error }, { status: p.status });
    images.push(p);
  }

  try {
    const out = await scanImages(images, {
      tripCode: body.context?.tripCode,
      memberCashRate: body.context?.memberCashRate ?? null,
      today: body.context?.today ?? new Date().toISOString().slice(0, 10),
    });
    if (!out.ok) return Response.json({ error: out.error }, { status: out.status });
    // `result` = first claim for the common single-purchase case; `claims` carries all of them.
    return Response.json({ claims: out.claims, result: out.claims[0], meta: { prompt: out.promptVersion, usage: out.usage } });
  } catch (err) {
    console.error("scan failed", err);
    return Response.json({ error: "Scan failed" }, { status: 500 });
  }
}
