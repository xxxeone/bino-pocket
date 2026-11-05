"use client";

/**
 * Client-side data access. Every call goes through Supabase RLS, so the
 * browser can only read/write what the signed-in user is allowed to.
 */
import { supabaseBrowser } from "./supabase/client";
import { RECEIPTS_BUCKET } from "./constants";
import type { Claim, ClaimImage, ClaimWithPeople, Profile, Trip, TripMember } from "./types";

const PEOPLE = "user:fin_profiles!fin_claims_user_id_fkey(id,name,color), to_user:fin_profiles!fin_claims_to_user_id_fkey(id,name,color)";

export async function listMyTrips(): Promise<Trip[]> {
  const sb = supabaseBrowser();
  const { data, error } = await sb.from("fin_trips").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Trip[];
}

export async function listTripMembers(tripId: string): Promise<(TripMember & { profile: Profile })[]> {
  const sb = supabaseBrowser();
  const { data, error } = await sb
    .from("fin_trip_members")
    .select("*, profile:fin_profiles(*)")
    .eq("trip_id", tripId);
  if (error) throw error;
  return (data ?? []) as (TripMember & { profile: Profile })[];
}

export async function listProfiles(): Promise<Profile[]> {
  const sb = supabaseBrowser();
  const { data, error } = await sb.from("fin_profiles").select("*").order("name");
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function listClaims(opts: {
  tripId: string;
  userId?: string;
  status?: Claim["status"];
  withImages?: boolean;
}): Promise<ClaimWithPeople[]> {
  const sb = supabaseBrowser();
  let q = sb
    .from("fin_claims")
    .select(`*, ${PEOPLE}${opts.withImages ? ", images:fin_claim_images(*)" : ""}`)
    .eq("trip_id", opts.tripId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (opts.userId) q = q.or(`user_id.eq.${opts.userId},to_user_id.eq.${opts.userId}`);
  if (opts.status) q = q.eq("status", opts.status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ClaimWithPeople[];
}

export async function getClaim(id: string): Promise<ClaimWithPeople | null> {
  const sb = supabaseBrowser();
  const { data, error } = await sb
    .from("fin_claims")
    .select(`*, ${PEOPLE}, images:fin_claim_images(*)`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as ClaimWithPeople) ?? null;
}

export type NewClaim = Omit<
  Claim,
  "id" | "status" | "reviewed_by" | "reviewed_at" | "reject_reason" | "created_at" | "updated_at"
>;

export async function insertClaim(claim: NewClaim): Promise<Claim> {
  const sb = supabaseBrowser();
  const { data, error } = await sb.from("fin_claims").insert(claim).select("*").single();
  if (error) throw error;
  return data as Claim;
}

export async function updateClaim(id: string, patch: Partial<Claim>): Promise<void> {
  const sb = supabaseBrowser();
  const { error } = await sb.from("fin_claims").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteClaim(id: string): Promise<void> {
  const sb = supabaseBrowser();
  const { error } = await sb.from("fin_claims").delete().eq("id", id);
  if (error) throw error;
}

/** Upload a receipt image; returns the storage path to store on fin_claim_images. */
export async function uploadReceipt(tripId: string, userId: string, blob: Blob): Promise<string> {
  const sb = supabaseBrowser();
  const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${tripId}/${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from(RECEIPTS_BUCKET).upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false });
  if (error) throw error;
  return path;
}

export async function addClaimImages(claimId: string, userId: string, paths: string[], kind = "receipt"): Promise<ClaimImage[]> {
  if (!paths.length) return [];
  const sb = supabaseBrowser();
  const { data, error } = await sb
    .from("fin_claim_images")
    .insert(paths.map((p) => ({ claim_id: claimId, user_id: userId, storage_path: p, kind })))
    .select("*");
  if (error) throw error;
  return (data ?? []) as ClaimImage[];
}

const urlCache = new Map<string, { url: string; exp: number }>();
/** Signed URL for a private receipt (cached ~50 min). */
export async function receiptUrl(path: string): Promise<string> {
  const hit = urlCache.get(path);
  if (hit && hit.exp > Date.now()) return hit.url;
  const sb = supabaseBrowser();
  const { data, error } = await sb.storage.from(RECEIPTS_BUCKET).createSignedUrl(path, 3600);
  if (error || !data) throw error ?? new Error("no url");
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}

export async function listCheckins(tripId: string, userId: string): Promise<string[]> {
  const sb = supabaseBrowser();
  const { data, error } = await sb.from("fin_checkins").select("date").eq("trip_id", tripId).eq("user_id", userId);
  if (error) throw error;
  return ((data ?? []) as { date: string }[]).map((r) => r.date);
}

export async function checkin(tripId: string, userId: string, date: string): Promise<void> {
  const sb = supabaseBrowser();
  const { error } = await sb.from("fin_checkins").upsert({ trip_id: tripId, user_id: userId, date }, { onConflict: "user_id,trip_id,date" });
  if (error) throw error;
}

export async function setMyCashRate(tripId: string, userId: string, rate: number | null): Promise<void> {
  const sb = supabaseBrowser();
  const { error } = await sb.from("fin_trip_members").update({ cash_rate: rate }).eq("trip_id", tripId).eq("user_id", userId);
  if (error) throw error;
}

export async function reviewClaim(id: string, status: "approved" | "rejected", reviewerId: string, reason?: string) {
  const sb = supabaseBrowser();
  const { error } = await sb
    .from("fin_claims")
    .update({ status, reviewed_by: reviewerId, reviewed_at: new Date().toISOString(), reject_reason: reason ?? null })
    .eq("id", id);
  if (error) throw error;
}

/** Claims by this member in the trip with the same date and the same RMB or MYR amount (duplicate guard). */
export async function findSimilarClaims(tripId: string, userId: string, date: string, rmb: number | null, myr: number | null): Promise<Claim[]> {
  if (rmb == null && myr == null) return [];
  const sb = supabaseBrowser();
  let q = sb.from("fin_claims").select("*").eq("trip_id", tripId).eq("user_id", userId).eq("date", date).neq("status", "rejected");
  q = rmb != null ? q.eq("amount_rmb", rmb) : q.eq("amount_myr", myr as number);
  const { data } = await q.limit(3);
  return (data ?? []) as Claim[];
}
