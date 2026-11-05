import { parseImages, scanAudit, type AuditState } from "@/lib/scan";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 26;

interface Body {
  images?: { dataUrl?: string }[];
  audit?: AuditState;
  issues?: string[];
}

/** POST /api/scan/verify → second read of the same images: { claims, corrections, meta }. */
export async function POST(req: Request) {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "AI not configured" }, { status: 503 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseImages(body.images ?? []);
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: parsed.status });
  if (!body.audit?.userText || !Array.isArray(body.audit.assistant)) return Response.json({ error: "Missing audit state" }, { status: 400 });

  try {
    const r = await scanAudit(parsed, body.audit, Array.isArray(body.issues) ? body.issues : []);
    if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
    return Response.json({ claims: r.claims, corrections: r.corrections, meta: { usage: r.usage, model: r.model } });
  } catch (err) {
    console.error("scan verify failed", err);
    return Response.json({ error: "Verify failed" }, { status: 500 });
  }
}
