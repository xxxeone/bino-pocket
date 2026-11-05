import { Drive, SETTING_KEYS, loadDriveConfig, saveSetting } from "@/lib/drive";
import { currentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Google redirects here with ?code=…; exchange it, store the refresh token, create the root folder. */
export async function GET(req: Request) {
  const u = await currentUser();
  if (!u || u.profile.role !== "admin") return Response.json({ error: "Admins only" }, { status: 403 });
  const url = new URL(req.url);
  const back = (q: string) => Response.redirect(new URL(`/admin/drive?${q}`, req.url), 302);

  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");
  if (err || !code) return back(`error=${encodeURIComponent(err ?? "missing_code")}`);

  const cfg = await loadDriveConfig(u.sb);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId ?? "",
      client_secret: cfg.clientSecret ?? "",
      redirect_uri: `${url.origin}/api/drive/callback`,
      grant_type: "authorization_code",
    }),
  });
  const j = (await res.json()) as { refresh_token?: string; error?: string; error_description?: string };
  if (!res.ok || !j.refresh_token) return back(`error=${encodeURIComponent(j.error_description ?? j.error ?? "no_refresh_token")}`);

  try {
    await saveSetting(u.sb, SETTING_KEYS.refreshToken, j.refresh_token, u.user.id);
    const drive = new Drive({ ...cfg, refreshToken: j.refresh_token });
    const [root, about] = await Promise.all([drive.rootFolder(), drive.about().catch(() => ({ email: null }))]);
    await saveSetting(u.sb, SETTING_KEYS.rootFolderId, root, u.user.id);
    if (about.email) await saveSetting(u.sb, SETTING_KEYS.account, about.email, u.user.id);
  } catch (e) {
    return back(`error=${encodeURIComponent((e as Error).message)}`);
  }
  return back("connected=1");
}
