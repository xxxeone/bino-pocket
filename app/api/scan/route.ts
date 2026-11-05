import { buildHints, parseImages, scanFirst } from "@/lib/scan";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
// Netlify functions time out at 10–26 s: each pass is its own request (see ./verify).
export const maxDuration = 26;

interface Body {
  images?: { dataUrl?: string }[];
  context?: { tripId?: string; tripCode?: string; memberCashRate?: number | null; today?: string };
}

/** POST /api/scan → first read: { claims, issues, audit, meta }. The client then calls /api/scan/verify. */
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
  const parsed = parseImages(body.images ?? []);
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: parsed.status });

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
    const r = await scanFirst(parsed, { tripCode: ctx.tripCode, memberCashRate: ctx.memberCashRate, today, hints });
    if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
    return Response.json({
      result: r.claims[0],
      claims: r.claims,
      issues: r.issues,
      audit: r.audit,
      meta: { prompt: r.promptVersion, usage: r.usage, model: r.model },
    });
  } catch (err) {
    console.error("scan failed", err);
    return Response.json({ error: "Scan failed" }, { status: 500 });
  }
}
