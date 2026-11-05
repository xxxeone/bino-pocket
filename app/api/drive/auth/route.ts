import { DRIVE_SCOPE, hasClient, loadDriveConfig } from "@/lib/drive";
import { currentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Admin only: start the one-time Google consent flow. */
export async function GET(req: Request) {
  const u = await currentUser();
  if (!u || u.profile.role !== "admin") return Response.json({ error: "Admins only" }, { status: 403 });
  const cfg = await loadDriveConfig(u.sb);
  if (!hasClient(cfg)) return Response.redirect(new URL("/admin/drive?error=missing_client", req.url), 302);
  const origin = new URL(req.url).origin;
  const params = new URLSearchParams({
    client_id: cfg.clientId!,
    redirect_uri: `${origin}/api/drive/callback`,
    response_type: "code",
    scope: DRIVE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302);
}
