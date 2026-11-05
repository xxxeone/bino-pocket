/**
 * Google Drive archive for receipts (server only).
 *
 * Every receipt is also copied to the admin's Google Drive under
 *   Bino Pocket / {TRIP CODE} / {Member name} / {date} {description} ({n}).jpg
 * so the team can browse receipts exactly like they did with Drive folders.
 *
 * Configuration lives in the fin_settings table (filled in from Admin → Google
 * Drive, no env vars needed) with env vars as a fallback. Scope is drive.file
 * (only files/folders this app created): a non-sensitive scope, so no Google
 * verification and the refresh token does not expire.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const ROOT_NAME = "Bino Pocket";

export const SETTING_KEYS = {
  clientId: "google_client_id",
  clientSecret: "google_client_secret",
  refreshToken: "google_refresh_token",
  rootFolderId: "drive_root_folder_id",
  account: "google_account_email",
} as const;

export interface DriveConfig {
  clientId: string | null;
  clientSecret: string | null;
  refreshToken: string | null;
  rootFolderId: string | null;
  account: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>;

/** Read config with the caller's session (RLS: leads/admins only) — env vars fill any gaps. */
export async function loadDriveConfig(sb: AnySupabase): Promise<DriveConfig> {
  const { data } = await sb.from("fin_settings").select("key,value");
  const map = new Map<string, string>((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
  const pick = (k: string, env?: string) => map.get(k) || (env ? process.env[env] : undefined) || null;
  return {
    clientId: pick(SETTING_KEYS.clientId, "GOOGLE_CLIENT_ID"),
    clientSecret: pick(SETTING_KEYS.clientSecret, "GOOGLE_CLIENT_SECRET"),
    refreshToken: pick(SETTING_KEYS.refreshToken, "GOOGLE_REFRESH_TOKEN"),
    rootFolderId: pick(SETTING_KEYS.rootFolderId, "GOOGLE_DRIVE_ROOT_FOLDER_ID"),
    account: pick(SETTING_KEYS.account),
  };
}

export async function saveSetting(sb: AnySupabase, key: string, value: string, userId: string) {
  const { error } = await sb.from("fin_settings").upsert({ key, value, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

export const isConnected = (c: DriveConfig) => Boolean(c.clientId && c.clientSecret && c.refreshToken);
export const hasClient = (c: DriveConfig) => Boolean(c.clientId && c.clientSecret);

const tokenCache = new Map<string, { token: string; exp: number }>();

export async function accessToken(c: DriveConfig): Promise<string> {
  if (!isConnected(c)) throw new Error("Google Drive is not connected");
  const hit = tokenCache.get(c.refreshToken!);
  if (hit && hit.exp > Date.now() + 30_000) return hit.token;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.clientId!,
      client_secret: c.clientSecret!,
      refresh_token: c.refreshToken!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Drive auth failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache.set(c.refreshToken!, { token: j.access_token, exp: Date.now() + j.expires_in * 1000 });
  return j.access_token;
}

export class Drive {
  constructor(private cfg: DriveConfig) {}

  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await accessToken(this.cfg);
    const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`Drive ${init.method ?? "GET"} ${path} → ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  }

  /** Find (or create) a folder by name under a parent ("root" = My Drive). */
  async ensureFolder(name: string, parentId: string): Promise<string> {
    const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const q = `name = '${esc(name)}' and mimeType = '${FOLDER}' and '${parentId}' in parents and trashed = false`;
    const found = await this.api<{ files: { id: string }[] }>(`/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`);
    if (found.files[0]) return found.files[0].id;
    const created = await this.api<{ id: string }>(`/files?fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId] }),
    });
    return created.id;
  }

  async rootFolder(): Promise<string> {
    return this.cfg.rootFolderId || this.ensureFolder(ROOT_NAME, "root");
  }

  /** Upload bytes; returns Drive file id + view link. */
  async uploadFile(name: string, mime: string, bytes: ArrayBuffer, parentId: string): Promise<{ id: string; url: string }> {
    const boundary = "bino" + Math.random().toString(36).slice(2);
    const meta = JSON.stringify({ name, parents: [parentId] });
    const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`;
    const tail = `\r\n--${boundary}--`;
    const r = await this.api<{ id: string; webViewLink: string }>(`${UPLOAD}/files?uploadType=multipart&fields=id,webViewLink`, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body: new Blob([head, bytes, tail]),
    });
    return { id: r.id, url: r.webViewLink };
  }

  /** Who is connected (for the settings page). */
  async about(): Promise<{ email: string | null }> {
    const r = await this.api<{ user?: { emailAddress?: string } }>(`/about?fields=user(emailAddress)`);
    return { email: r.user?.emailAddress ?? null };
  }
}

export const folderLink = (id: string) => `https://drive.google.com/drive/folders/${id}`;

/** Safe file name: keep CJK, letters, digits, spaces, dashes. */
export function safeName(s: string, max = 60) {
  return s.replace(/[\\/:*?"<>|#%{}$!'`]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
