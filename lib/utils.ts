import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Claim } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const myrFmt = new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR", minimumFractionDigits: 2 });
const rmbFmt = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2 });

export function fmtMYR(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return myrFmt.format(n).replace("MYR", "RM").replace(/\s/g, "");
}
export function fmtRMB(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return rmbFmt.format(n).replace("CN¥", "¥");
}
export function fmtRate(r: number | null | undefined) {
  if (r == null || Number.isNaN(r)) return "—";
  return r.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

/** Today in local time as YYYY-MM-DD. */
export function todayISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 2026-10-11 -> 11/10/2026 (the team's sheet format) */
export function fmtDateDMY(iso: string | null | undefined) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
export function fmtDateShort(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
}

/** Rate is RMB per 1 MYR (e.g. 1.60). Derive the missing amount. */
export function deriveAmounts(input: { amount_rmb: number | null; amount_myr: number | null; rate: number | null }) {
  let { amount_rmb, amount_myr, rate } = input;
  if (amount_rmb != null && amount_myr != null && amount_myr > 0) {
    rate = round(amount_rmb / amount_myr, 6);
  } else if (amount_rmb != null && rate && rate > 0) {
    amount_myr = round(amount_rmb / rate, 2);
  } else if (amount_myr != null && rate && rate > 0) {
    amount_rmb = round(amount_myr * rate, 2);
  }
  return { amount_rmb, amount_myr, rate };
}

export function round(n: number, dp: number) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Money direction for a claim from the point of view of `userId`. */
export function moneyDirection(c: Claim, userId: string): "out" | "in" | "none" {
  if (c.kind === "cash_in") return c.user_id === userId ? "in" : "none";
  if (c.kind === "transfer") {
    if (c.user_id === userId) return "out";
    if (c.to_user_id === userId) return "in";
    return "none";
  }
  return c.user_id === userId ? "out" : "none";
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Compress an image File to a JPEG data URL (max side `max`, quality `q`). */
export async function compressImage(file: File, max = 1600, q = 0.85): Promise<{ dataUrl: string; blob: Blob }> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    // HEIC or unsupported: fall back to raw file
    const dataUrl = await blobToDataUrl(file);
    return { dataUrl, blob: file };
  }
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/jpeg", q));
  const dataUrl = await blobToDataUrl(blob);
  return { dataUrl, blob };
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

/** Consecutive-day streak ending today or yesterday, from a set of YYYY-MM-DD strings. */
export function streakFrom(dates: Set<string>, today = new Date()): number {
  let streak = 0;
  const cur = new Date(today);
  // allow today to be missing (day not over yet)
  if (!dates.has(todayISO(cur))) cur.setDate(cur.getDate() - 1);
  while (dates.has(todayISO(cur))) {
    streak++;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}
