export type Role = "member" | "lead" | "admin";
export type ClaimKind = "expense" | "transfer" | "cash_in";
export type ClaimStatus = "pending" | "approved" | "rejected";
export type Purpose = "team" | "client" | "company";

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: Role;
  color: string;
  active: boolean;
}

export interface Trip {
  id: string;
  code: string;
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  budget_myr: number | null;
  status: "active" | "closed";
  created_by: string | null;
  created_at: string;
}

export interface TripMember {
  trip_id: string;
  user_id: string;
  cash_rate: number | null;
  joined_at: string;
}

export interface Claim {
  id: string;
  trip_id: string;
  user_id: string;
  kind: ClaimKind;
  date: string; // YYYY-MM-DD
  description: string;
  category: string;
  platform: string | null;
  payment_method: string | null;
  purpose: Purpose;
  amount_rmb: number | null;
  amount_myr: number | null;
  rate: number | null;
  rate_source: string | null;
  merchant: string | null;
  to_user_id: string | null;
  status: ClaimStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  is_late: boolean;
  late_reason: string | null;
  ai_confidence: string | null;
  ai_raw: unknown;
  /** What the user changed vs. the AI's suggestion (for prompt tuning). */
  ai_corrections?: unknown;
  created_at: string;
  updated_at: string;
}

export interface ClaimImage {
  id: string;
  claim_id: string;
  user_id: string;
  storage_path: string;
  kind: string;
  drive_file_id?: string | null;
  drive_url?: string | null;
  drive_synced_at?: string | null;
  created_at: string;
}

export interface Checkin {
  user_id: string;
  trip_id: string;
  date: string;
}

/** Claim joined with the people involved (for lists/reports). */
export type ClaimWithPeople = Claim & {
  user: Pick<Profile, "id" | "name" | "color">;
  to_user: Pick<Profile, "id" | "name" | "color"> | null;
  images?: ClaimImage[];
};

/** What the AI scan returns for one purchase (a scan may return several). */
export interface ScanResult {
  /** 0-based indexes of the uploaded images this claim was read from. */
  image_indexes: number[];
  date: string | null;
  merchant: string | null;
  description: string;
  category: string;
  platform: string | null;
  payment_method: string | null;
  purpose: Purpose;
  amount_rmb: number | null;
  amount_myr: number | null;
  rate: number | null;
  rate_source: "screenshot" | "computed" | null;
  confidence: "high" | "medium" | "low";
  notes: string | null;
  /** Per-image summary so the user can see what each screenshot contributed. */
  images: { index: number; type: string; amount: number | null; currency: "RMB" | "MYR" | null }[];
  /** Filled when the second (audit) pass ran. */
  verification?: ScanVerification;
}

export interface ScanCorrection {
  field: string;
  from: string | null;
  to: string | null;
  why: string;
}
export interface ScanVerification {
  checked: boolean;
  /** Programmatic issues found between the passes (empty = all consistent). */
  issues: string[];
  corrections: ScanCorrection[];
}
