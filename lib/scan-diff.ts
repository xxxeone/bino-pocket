import type { ScanResult } from "./types";

export interface ScanDiff {
  field: string;
  ai: string | number | null;
  user: string | number | null;
}

/**
 * What the member changed versus the AI suggestion. Stored on the claim so the
 * prompt can be tuned against real corrections later.
 */
export function diffScan(
  raw: ScanResult,
  out: {
    date: string;
    description: string;
    category: string;
    platform: string | null;
    payment_method: string | null;
    purpose: string;
    amount_rmb: number | null;
    amount_myr: number | null;
    rate: number | null;
    merchant: string | null;
  },
): ScanDiff[] {
  const diffs: ScanDiff[] = [];
  const str = (field: string, a: string | null | undefined, b: string | null | undefined) => {
    const x = (a ?? "").trim();
    const y = (b ?? "").trim();
    if (x !== y) diffs.push({ field, ai: x || null, user: y || null });
  };
  const num = (field: string, a: number | null | undefined, b: number | null | undefined, tol: number) => {
    if (a == null && b == null) return;
    if (a == null || b == null || Math.abs(a - b) > tol) diffs.push({ field, ai: a ?? null, user: b ?? null });
  };
  // A null AI date means "no date on the receipt" — the app filling in today is not a correction.
  if (raw.date) str("date", raw.date, out.date);
  str("description", raw.description, out.description);
  str("category", raw.category, out.category);
  str("platform", raw.platform, out.platform);
  str("payment_method", raw.payment_method, out.payment_method);
  str("purpose", raw.purpose, out.purpose);
  num("amount_rmb", raw.amount_rmb, out.amount_rmb, 0.005);
  // MYR filled by the member's cash rate when the AI left it null is expected, not a correction.
  if (raw.amount_myr != null || raw.rate != null) num("amount_myr", raw.amount_myr, out.amount_myr, 0.005);
  if (raw.rate != null) num("rate", raw.rate, out.rate, 0.0005);
  str("merchant", raw.merchant, out.merchant);
  return diffs;
}
