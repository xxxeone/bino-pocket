/**
 * Pure report maths for a trip. No React, no Supabase — unit-testable.
 *
 * Money rules:
 *  - kind='expense'  → money OUT for user_id (this is the only thing that counts as trip spend)
 *  - kind='transfer' → OUT for user_id, IN for to_user_id (internal movement, not spend)
 *  - kind='cash_in'  → IN for user_id (petty cash received, not spend)
 *  - rejected claims are excluded everywhere except `rejected_count`
 *  - pending claims are included only when `includePending` is true
 */
import { CATEGORIES, PURPOSES, optionEmoji, optionLabel } from "./constants";
import type { Claim, ClaimWithPeople, Profile, Trip } from "./types";
import { fmtDateDMY, fmtMYR, fmtRMB, round, todayISO } from "./utils";

export interface ReportOptions {
  includePending: boolean;
}

export interface Person {
  id: string;
  name: string;
  color: string;
}

export interface PersonTotals {
  user: Person;
  expenses_myr: number;
  expenses_rmb: number;
  transfers_out_myr: number;
  transfers_in_myr: number;
  cash_in_myr: number;
  /** cash_in + transfers_in − expenses − transfers_out */
  balance_myr: number;
  /** expenses + transfers_out (what shows on their sheet) */
  items_count: number;
  pending_count: number;
  approved_count: number;
  rejected_count: number;
  late_count: number;
  claims: ClaimWithPeople[];
}

export interface BucketTotal {
  id: string;
  label: string;
  emoji: string;
  myr: number;
  rmb: number;
  count: number;
  pct: number; // share of spend, 0..100
}

export interface DayTotal {
  date: string;
  myr: number;
  count: number;
}

export interface TripTotals {
  spent_myr: number;
  spent_rmb: number;
  items: number;
  pending_count: number;
  approved_count: number;
  rejected_count: number;
  late_count: number;
  /** total pending expense value (MYR), regardless of includePending */
  pending_myr: number;
}

export interface Report {
  options: ReportOptions;
  totals: TripTotals;
  people: PersonTotals[];
  byCategory: BucketTotal[];
  byPurpose: BucketTotal[];
  byDay: DayTotal[];
  budget: { budget_myr: number | null; used_pct: number | null; remaining_myr: number | null };
}

const num = (v: number | string | null | undefined) => (v == null ? 0 : Number(v) || 0);

function counted(c: Claim, opts: ReportOptions) {
  if (c.status === "rejected") return false;
  if (c.status === "pending" && !opts.includePending) return false;
  return true;
}

export function buildReport(
  claims: ClaimWithPeople[],
  members: Person[],
  trip: Pick<Trip, "budget_myr"> | null,
  options: ReportOptions,
): Report {
  const people = new Map<string, PersonTotals>();
  const ensure = (p: Person) => {
    let row = people.get(p.id);
    if (!row) {
      row = {
        user: p,
        expenses_myr: 0,
        expenses_rmb: 0,
        transfers_out_myr: 0,
        transfers_in_myr: 0,
        cash_in_myr: 0,
        balance_myr: 0,
        items_count: 0,
        pending_count: 0,
        approved_count: 0,
        rejected_count: 0,
        late_count: 0,
        claims: [],
      };
      people.set(p.id, row);
    }
    return row;
  };
  members.forEach(ensure);

  const totals: TripTotals = {
    spent_myr: 0,
    spent_rmb: 0,
    items: 0,
    pending_count: 0,
    approved_count: 0,
    rejected_count: 0,
    late_count: 0,
    pending_myr: 0,
  };
  const cat = new Map<string, BucketTotal>();
  const pur = new Map<string, BucketTotal>();
  const day = new Map<string, DayTotal>();

  for (const c of claims) {
    const owner = ensure(c.user ?? { id: c.user_id, name: "Unknown", color: "#8a9a98" });
    owner.claims.push(c);
    // status counters (always)
    if (c.status === "pending") {
      owner.pending_count++;
      totals.pending_count++;
      if (c.kind === "expense") totals.pending_myr += num(c.amount_myr);
    } else if (c.status === "approved") {
      owner.approved_count++;
      totals.approved_count++;
    } else {
      owner.rejected_count++;
      totals.rejected_count++;
    }
    if (c.is_late && c.status !== "rejected") {
      owner.late_count++;
      totals.late_count++;
    }
    if (!counted(c, options)) continue;

    const myr = num(c.amount_myr);
    const rmb = num(c.amount_rmb);
    if (c.kind === "expense") {
      owner.expenses_myr += myr;
      owner.expenses_rmb += rmb;
      owner.items_count++;
      totals.spent_myr += myr;
      totals.spent_rmb += rmb;
      totals.items++;
      bump(cat, c.category || "other", CATEGORIES, myr, rmb);
      bump(pur, c.purpose || "team", PURPOSES, myr, rmb);
      const d = day.get(c.date) ?? { date: c.date, myr: 0, count: 0 };
      d.myr += myr;
      d.count++;
      day.set(c.date, d);
    } else if (c.kind === "transfer") {
      owner.transfers_out_myr += myr;
      owner.items_count++;
      if (c.to_user_id) {
        const to = ensure(c.to_user ?? { id: c.to_user_id, name: "Unknown", color: "#8a9a98" });
        to.transfers_in_myr += myr;
      }
    } else if (c.kind === "cash_in") {
      owner.cash_in_myr += myr;
    }
  }

  for (const p of people.values()) {
    p.balance_myr = round(p.cash_in_myr + p.transfers_in_myr - p.expenses_myr - p.transfers_out_myr, 2);
    p.expenses_myr = round(p.expenses_myr, 2);
    p.expenses_rmb = round(p.expenses_rmb, 2);
    p.transfers_in_myr = round(p.transfers_in_myr, 2);
    p.transfers_out_myr = round(p.transfers_out_myr, 2);
    p.cash_in_myr = round(p.cash_in_myr, 2);
    p.claims.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }
  totals.spent_myr = round(totals.spent_myr, 2);
  totals.spent_rmb = round(totals.spent_rmb, 2);
  totals.pending_myr = round(totals.pending_myr, 2);

  const finish = (m: Map<string, BucketTotal>) =>
    [...m.values()]
      .map((b) => ({ ...b, myr: round(b.myr, 2), rmb: round(b.rmb, 2), pct: totals.spent_myr > 0 ? round((b.myr / totals.spent_myr) * 100, 1) : 0 }))
      .sort((a, b) => b.myr - a.myr);

  const budget_myr = trip?.budget_myr != null ? num(trip.budget_myr) : null;
  return {
    options,
    totals,
    people: [...people.values()].sort((a, b) => b.expenses_myr + b.transfers_out_myr - (a.expenses_myr + a.transfers_out_myr)),
    byCategory: finish(cat),
    byPurpose: finish(pur),
    byDay: [...day.values()].map((d) => ({ ...d, myr: round(d.myr, 2) })).sort((a, b) => (a.date < b.date ? -1 : 1)),
    budget: {
      budget_myr,
      used_pct: budget_myr && budget_myr > 0 ? round((totals.spent_myr / budget_myr) * 100, 1) : null,
      remaining_myr: budget_myr != null ? round(budget_myr - totals.spent_myr, 2) : null,
    },
  };
}

function bump(
  m: Map<string, BucketTotal>,
  id: string,
  list: typeof CATEGORIES,
  myr: number,
  rmb: number,
) {
  const b = m.get(id) ?? { id, label: optionLabel(list, id), emoji: optionEmoji(list, id), myr: 0, rmb: 0, count: 0, pct: 0 };
  b.myr += myr;
  b.rmb += rmb;
  b.count++;
  m.set(id, b);
}

/* ---------------- fun stats ---------------- */

export interface FunStats {
  mostPunctual: { user: Person; lateRatio: number; items: number } | null;
  longestStreak: { user: Person; days: number } | null;
  foodChampion: { user: Person; myr: number } | null;
  biggestSingle: { user: Person; claim: ClaimWithPeople } | null;
}

/** Longest run of consecutive YYYY-MM-DD dates. */
export function longestRun(dates: Iterable<string>): number {
  const sorted = [...new Set(dates)].sort();
  let best = 0;
  let cur = 0;
  let prev: Date | null = null;
  for (const iso of sorted) {
    const d = new Date(iso + "T00:00:00Z");
    if (prev && d.getTime() - prev.getTime() === 86400000) cur++;
    else cur = 1;
    best = Math.max(best, cur);
    prev = d;
  }
  return best;
}

export function funStats(report: Report, checkins: { user_id: string; date: string }[]): FunStats {
  const people = report.people;
  const byId = new Map(people.map((p) => [p.user.id, p.user]));

  const punctualCandidates = people
    .map((p) => {
      const n = p.claims.filter((c) => c.status !== "rejected").length;
      return { user: p.user, lateRatio: n ? p.late_count / n : 1, items: n };
    })
    .filter((p) => p.items >= 3)
    .sort((a, b) => a.lateRatio - b.lateRatio || b.items - a.items);

  const streaks = new Map<string, string[]>();
  for (const c of checkins) {
    const arr = streaks.get(c.user_id) ?? [];
    arr.push(c.date);
    streaks.set(c.user_id, arr);
  }
  let longestStreak: FunStats["longestStreak"] = null;
  for (const [uid, dates] of streaks) {
    const days = longestRun(dates);
    const user = byId.get(uid);
    if (user && days > 0 && (!longestStreak || days > longestStreak.days)) longestStreak = { user, days };
  }

  let foodChampion: FunStats["foodChampion"] = null;
  let biggestSingle: FunStats["biggestSingle"] = null;
  for (const p of people) {
    let food = 0;
    for (const c of p.claims) {
      if (!counted(c, report.options) || c.kind !== "expense") continue;
      if (c.category === "food" || c.category === "snacks") food += num(c.amount_myr);
      if (!biggestSingle || num(c.amount_myr) > num(biggestSingle.claim.amount_myr)) biggestSingle = { user: p.user, claim: c };
    }
    if (food > 0 && (!foodChampion || food > foodChampion.myr)) foodChampion = { user: p.user, myr: round(food, 2) };
  }

  return {
    mostPunctual: punctualCandidates[0] ?? null,
    longestStreak,
    foodChampion,
    biggestSingle,
  };
}

/* ---------------- WhatsApp text ---------------- */

const money = (n: number) => fmtMYR(n);

export function whatsappSummary(report: Report, trip: Pick<Trip, "code" | "name">, asOf = todayISO()): string {
  const t = report.totals;
  const lines: string[] = [];
  lines.push(`📊 ${trip.code} — Petty Cash Summary (as of ${fmtDateDMY(asOf)})`);
  lines.push(`Total spent: ${money(t.spent_myr)} (${fmtRMB(t.spent_rmb)})${report.options.includePending ? " incl. pending" : " approved only"}`);
  if (report.budget.budget_myr != null) {
    lines.push(`Budget: ${money(report.budget.budget_myr)} · ${report.budget.used_pct}% used · ${money(report.budget.remaining_myr ?? 0)} left`);
  }
  lines.push("");
  for (const p of report.people) {
    if (p.items_count === 0 && p.pending_count === 0 && p.cash_in_myr === 0 && p.transfers_in_myr === 0) continue;
    const bits: string[] = [`${p.items_count} item${p.items_count === 1 ? "" : "s"}`];
    if (p.pending_count) bits.push(`${p.pending_count} pending`);
    const extra: string[] = [];
    if (p.cash_in_myr) extra.push(`in ${money(p.cash_in_myr + p.transfers_in_myr)}`);
    else if (p.transfers_in_myr) extra.push(`in ${money(p.transfers_in_myr)}`);
    if (p.transfers_out_myr) extra.push(`transferred ${money(p.transfers_out_myr)}`);
    lines.push(`👤 ${p.user.name} — ${money(p.expenses_myr)} (${bits.join(", ")})${extra.length ? " · " + extra.join(" · ") : ""}`);
  }
  if (report.byCategory.length) {
    lines.push("");
    lines.push(report.byCategory.map((b) => `${b.emoji} ${b.label.split(" ")[0]} ${money(b.myr)}`).join(" · "));
  }
  if (t.pending_count) {
    lines.push("");
    lines.push(`⏳ ${t.pending_count} pending approval (${money(t.pending_myr)})`);
  }
  return lines.join("\n");
}

export function whatsappDaily(claims: ClaimWithPeople[], trip: Pick<Trip, "code">, date = todayISO()): string {
  const todays = claims.filter((c) => c.date === date && c.status !== "rejected");
  const lines: string[] = [];
  lines.push(`🧾 ${trip.code} — ${fmtDateDMY(date)}`);
  if (!todays.length) {
    lines.push("No claims logged today.");
    return lines.join("\n");
  }
  const byUser = new Map<string, ClaimWithPeople[]>();
  for (const c of todays) {
    const arr = byUser.get(c.user_id) ?? [];
    arr.push(c);
    byUser.set(c.user_id, arr);
  }
  let total = 0;
  let pending = 0;
  for (const arr of byUser.values()) {
    const name = arr[0].user?.name ?? "Unknown";
    const sum = arr.filter((c) => c.kind === "expense").reduce((s, c) => s + num(c.amount_myr), 0);
    total += sum;
    lines.push("");
    lines.push(`👤 ${name} — ${money(sum)}`);
    for (const c of arr) {
      const amt = c.amount_myr != null ? money(num(c.amount_myr)) : fmtRMB(num(c.amount_rmb));
      const tag = c.kind === "transfer" ? "🔁 " : c.kind === "cash_in" ? "💵 " : `${optionEmoji(CATEGORIES, c.category)} `;
      lines.push(`  ${tag}${c.description} — ${amt}${c.status === "pending" ? " ⏳" : ""}`);
      if (c.status === "pending") pending++;
    }
  }
  lines.push("");
  lines.push(`Total today: ${money(round(total, 2))}${pending ? ` · ⏳ ${pending} pending` : ""}`);
  return lines.join("\n");
}

/** Narrow a Profile (or joined person) to the Person shape used by reports. */
export function toPerson(p: Pick<Profile, "id" | "name" | "color">): Person {
  return { id: p.id, name: p.name, color: p.color };
}
