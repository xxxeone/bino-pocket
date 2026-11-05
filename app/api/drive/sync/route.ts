import { Drive, folderLink, hasClient, isConnected, loadDriveConfig, safeName, SETTING_KEYS, saveSetting } from "@/lib/drive";
import { RECEIPTS_BUCKET } from "@/lib/constants";
import { currentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GET → Drive status for the settings page (leads/admins see the real state). */
export async function GET() {
  const u = await currentUser();
  if (!u) return Response.json({ error: "Not signed in" }, { status: 401 });
  const cfg = await loadDriveConfig(u.sb);
  return Response.json({
    connected: isConnected(cfg),
    hasClient: hasClient(cfg),
    clientId: cfg.clientId ? cfg.clientId.slice(0, 12) + "…" : null,
    account: cfg.account,
    folderUrl: cfg.rootFolderId ? folderLink(cfg.rootFolderId) : null,
  });
}

/**
 * POST { clientId, clientSecret } (admin) → save the OAuth client.
 * POST { claimId } | { tripId } (lead/admin) → copy unsynced receipts to Drive (max 40 per call, idempotent).
 * POST { disconnect: true } (admin) → forget the refresh token.
 */
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return Response.json({ error: "Not signed in" }, { status: 401 });
  const reviewer = u.profile.role === "lead" || u.profile.role === "admin";
  if (!reviewer) return Response.json({ error: "Management only" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { clientId?: string; clientSecret?: string; claimId?: string; tripId?: string; disconnect?: boolean };
  const { sb } = u;

  if (body.clientId !== undefined || body.clientSecret !== undefined) {
    if (u.profile.role !== "admin") return Response.json({ error: "Admins only" }, { status: 403 });
    const id = (body.clientId ?? "").trim();
    const secret = (body.clientSecret ?? "").trim();
    if (!id.endsWith(".apps.googleusercontent.com")) return Response.json({ error: "That doesn't look like a Client ID (should end with .apps.googleusercontent.com)" }, { status: 400 });
    if (secret.length < 10) return Response.json({ error: "Client secret looks too short" }, { status: 400 });
    await saveSetting(sb, SETTING_KEYS.clientId, id, u.user.id);
    await saveSetting(sb, SETTING_KEYS.clientSecret, secret, u.user.id);
    return Response.json({ ok: true });
  }

  if (body.disconnect) {
    if (u.profile.role !== "admin") return Response.json({ error: "Admins only" }, { status: 403 });
    await sb.from("fin_settings").delete().in("key", [SETTING_KEYS.refreshToken, SETTING_KEYS.account, SETTING_KEYS.rootFolderId]);
    return Response.json({ ok: true });
  }

  const cfg = await loadDriveConfig(sb);
  if (!isConnected(cfg)) return Response.json({ skipped: true, reason: "Drive not connected" });

  let q = sb
    .from("fin_claim_images")
    .select("id, storage_path, claim:fin_claims!inner(id, date, description, user_id, trip:fin_trips!inner(id, code), owner:fin_profiles!fin_claims_user_id_fkey(name))")
    .is("drive_file_id", null)
    .limit(40);
  if (body.claimId) q = q.eq("claim_id", body.claimId);
  else if (body.tripId) q = q.eq("claim.trip_id", body.tripId);
  else return Response.json({ error: "claimId or tripId required" }, { status: 400 });

  const { data: rows, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 400 });
  if (!rows?.length) return Response.json({ synced: 0, remaining: 0 });

  type Row = {
    id: string;
    storage_path: string;
    claim: { id: string; date: string; description: string; user_id: string; trip: { id: string; code: string }; owner: { name: string } | null };
  };
  const list = rows as unknown as Row[];

  const drive = new Drive(cfg);
  const root = await drive.rootFolder();
  if (!cfg.rootFolderId && u.profile.role === "admin") await saveSetting(sb, SETTING_KEYS.rootFolderId, root, u.user.id).catch(() => {});
  const folderCache = new Map<string, string>();
  const folderFor = async (code: string, name: string) => {
    const key = `${code}/${name}`;
    const hit = folderCache.get(key);
    if (hit) return hit;
    const tripFolder = await drive.ensureFolder(code, root);
    const memberFolder = await drive.ensureFolder(name, tripFolder);
    folderCache.set(key, memberFolder);
    return memberFolder;
  };

  const counter = new Map<string, number>();
  let synced = 0;
  const errors: string[] = [];
  for (const r of list) {
    try {
      const { data: file, error: dlErr } = await sb.storage.from(RECEIPTS_BUCKET).download(r.storage_path);
      if (dlErr || !file) throw new Error(dlErr?.message ?? "download failed");
      const n = (counter.get(r.claim.id) ?? 0) + 1;
      counter.set(r.claim.id, n);
      const ext = r.storage_path.split(".").pop() || "jpg";
      const name = `${r.claim.date} ${safeName(r.claim.description)}${n > 1 ? ` (${n})` : ""}.${ext}`;
      const folder = await folderFor(r.claim.trip.code, r.claim.owner?.name ?? "Unknown");
      const up = await drive.uploadFile(name, file.type || "image/jpeg", await file.arrayBuffer(), folder);
      const { error: upErr } = await sb
        .from("fin_claim_images")
        .update({ drive_file_id: up.id, drive_url: up.url, drive_synced_at: new Date().toISOString() })
        .eq("id", r.id);
      if (upErr) throw upErr;
      synced++;
    } catch (e) {
      errors.push(`${r.id}: ${(e as Error).message}`);
    }
  }
  return Response.json({ synced, remaining: list.length - synced, errors: errors.slice(0, 5) });
}
