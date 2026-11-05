"use client";

import { useApp } from "@/components/providers";
import { Button, Chips, Field, Input, Select, Textarea } from "@/components/ui";
import { CATEGORIES, PAYMENT_METHODS, PLATFORMS, PURPOSES, optionEmoji, optionLabel } from "@/lib/constants";
import { listTripMembers } from "@/lib/data";
import type { ClaimKind, Profile, Purpose, ScanResult } from "@/lib/types";
import { cn, fmtDateShort, fmtRate, round, todayISO } from "@/lib/utils";
import { AlertTriangle, ChevronDown, Loader2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/** What the scanner knows about this claim (shown in the pill above the form). */
export interface ClaimAi {
  confidence: ScanResult["confidence"];
  notes: string | null;
  verification?: ScanResult["verification"];
  /** Second read still running. */
  auditing?: boolean;
  /** Values from the second read when it changed something — applied only when the user taps Apply. */
  suggestion?: ClaimFormValues | null;
}

/** Editable form state. Amounts are strings so the user can type freely. */
export interface ClaimFormValues {
  kind: ClaimKind;
  date: string;
  description: string;
  category: string;
  platform: string | null;
  payment_method: string | null;
  purpose: Purpose;
  amount_rmb: string;
  amount_myr: string;
  rate: string;
  rate_source: string | null;
  merchant: string;
  to_user_id: string | null;
  late_reason: string | null;
}

export type ClaimFormOutput = {
  kind: ClaimKind;
  date: string;
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
  is_late: boolean;
  late_reason: string | null;
};

export const emptyValues = (kind: ClaimKind = "expense"): ClaimFormValues => ({
  kind,
  date: todayISO(),
  description: kind === "cash_in" ? "Petty cash received" : kind === "transfer" ? "Transfer to " : "",
  category: kind === "expense" ? "other" : kind,
  platform: null,
  payment_method: kind === "expense" ? null : "cash_rmb",
  purpose: kind === "expense" ? "team" : "company",
  amount_rmb: "",
  amount_myr: "",
  rate: "",
  rate_source: null,
  merchant: "",
  to_user_id: null,
  late_reason: null,
});

export function valuesFromScan(s: ScanResult): ClaimFormValues {
  const base = emptyValues("expense");
  return {
    ...base,
    date: s.date ?? base.date,
    description: s.description ?? "",
    category: s.category ?? "other",
    platform: s.platform,
    payment_method: s.payment_method,
    purpose: s.purpose ?? "team",
    amount_rmb: s.amount_rmb != null ? s.amount_rmb.toFixed(2) : "",
    amount_myr: s.amount_myr != null ? s.amount_myr.toFixed(2) : "",
    rate: s.rate != null ? String(s.rate) : "",
    rate_source: s.rate_source,
    merchant: s.merchant ?? "",
  };
}

export function valuesFromClaim(c: {
  kind: ClaimKind;
  date: string;
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
  late_reason: string | null;
}): ClaimFormValues {
  return {
    kind: c.kind,
    date: c.date,
    description: c.description,
    category: c.category,
    platform: c.platform,
    payment_method: c.payment_method,
    purpose: c.purpose,
    amount_rmb: c.amount_rmb != null ? String(c.amount_rmb) : "",
    amount_myr: c.amount_myr != null ? String(c.amount_myr) : "",
    rate: c.rate != null ? String(c.rate) : "",
    rate_source: c.rate_source,
    merchant: c.merchant ?? "",
    to_user_id: c.to_user_id,
    late_reason: c.late_reason,
  };
}

const num = (s: string): number | null => {
  const n = parseFloat(String(s).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Paying cash RMB with a known fixed cash rate and no rate yet → use the cash rate. */
function applyCashRate(s: ClaimFormValues, cashRate: number | null): ClaimFormValues {
  if (s.payment_method !== "cash_rmb" || !cashRate || s.rate) return s;
  const rmb = num(s.amount_rmb);
  return { ...s, rate: String(cashRate), rate_source: "cash_fixed", amount_myr: rmb ? String(round(rmb / cashRate, 2)) : s.amount_myr };
}

const LATE_REASONS = [
  { id: "forgot", label: "Forgot to log it" },
  { id: "no_internet", label: "No internet" },
  { id: "other", label: "Other" },
];

export function ClaimForm({
  initial,
  mode,
  ai,
  onSubmit,
  submitLabel,
}: {
  initial: ClaimFormValues;
  mode: "create" | "edit";
  ai?: ClaimAi | null;
  onSubmit: (v: ClaimFormOutput) => Promise<void>;
  submitLabel?: string;
}) {
  const { trip, membership, profile } = useApp();
  const cashRate = membership?.cash_rate ?? null;
  const [v, setV] = useState<ClaimFormValues>(() => applyCashRate(initial, cashRate));
  const [more, setMore] = useState(mode === "edit" || initial.kind !== "expense");
  const [members, setMembers] = useState<Profile[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const today = todayISO();
  const isLate = v.date < today;

  useEffect(() => {
    if (!trip) return;
    let on = true;
    void listTripMembers(trip.id).then((ms) => {
      if (on) setMembers(ms.map((m) => m.profile).filter((p) => p.id !== profile.id));
    });
    return () => {
      on = false;
    };
  }, [trip, profile.id]);

  function patch(p: Partial<ClaimFormValues>) {
    setV((s) => applyCashRate({ ...s, ...p }, cashRate));
  }

  /** Jump to a field inside "More details" (one-tap fix for AI-filled values). */
  function jumpTo(id: string) {
    setMore(true);
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }

  function editRmb(val: string) {
    const rmb = num(val);
    const myr = num(v.amount_myr);
    const rate = num(v.rate);
    const p: Partial<ClaimFormValues> = { amount_rmb: val };
    if (rmb && rate && v.rate_source !== "computed") p.amount_myr = String(round(rmb / rate, 2));
    else if (rmb && myr) {
      p.rate = String(round(rmb / myr, 6));
      p.rate_source = "computed";
    }
    patch(p);
  }
  function editMyr(val: string) {
    const myr = num(val);
    const rmb = num(v.amount_rmb);
    const rate = num(v.rate);
    const p: Partial<ClaimFormValues> = { amount_myr: val };
    if (myr && rmb) {
      p.rate = String(round(rmb / myr, 6));
      p.rate_source = "computed";
    } else if (myr && rate) p.amount_rmb = String(round(myr * rate, 2));
    patch(p);
  }
  function editRate(val: string) {
    const rate = num(val);
    const rmb = num(v.amount_rmb);
    const myr = num(v.amount_myr);
    const p: Partial<ClaimFormValues> = { rate: val, rate_source: "manual" };
    if (rate && rmb) p.amount_myr = String(round(rmb / rate, 2));
    else if (rate && myr) p.amount_rmb = String(round(myr * rate, 2));
    patch(p);
  }

  function setKind(kind: ClaimKind) {
    const base = emptyValues(kind);
    patch({
      kind,
      category: base.category,
      purpose: kind === "expense" ? v.purpose : "company",
      description: v.description && kind === "expense" ? v.description : base.description,
      payment_method: v.payment_method ?? base.payment_method,
    });
    if (kind !== "expense") setMore(true);
  }

  const toUser = useMemo(() => members.find((m) => m.id === v.to_user_id), [members, v.to_user_id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const rmb = num(v.amount_rmb);
    const myr = num(v.amount_myr);
    const desc = v.description.trim();
    if (!desc || (v.kind === "transfer" && desc === "Transfer to ")) return setErr("Add a short description.");
    if (!rmb && !myr) return setErr("Enter at least one amount.");
    if (v.kind === "transfer" && !v.to_user_id) return setErr("Choose who you transferred to.");
    if (isLate && !v.late_reason) return setErr("Tell us why this is logged late.");
    if (!v.date) return setErr("Pick a date.");
    setBusy(true);
    try {
      await onSubmit({
        kind: v.kind,
        date: v.date,
        description: desc,
        category: v.category,
        platform: v.platform,
        payment_method: v.payment_method,
        purpose: v.purpose,
        amount_rmb: rmb,
        amount_myr: myr,
        rate: num(v.rate),
        rate_source: num(v.rate) ? v.rate_source : null,
        merchant: v.merchant.trim() || null,
        to_user_id: v.kind === "transfer" ? v.to_user_id : null,
        is_late: isLate,
        late_reason: isLate ? v.late_reason : null,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 anim-rise">
      {ai && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-2xl px-3.5 py-2.5 text-sm",
            ai.confidence === "high" ? "bg-brand-soft text-brand" : "bg-amber-soft text-amber",
          )}
        >
          <Sparkles className="size-4 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold flex items-center gap-2 flex-wrap">
              <span>{ai.confidence === "high" ? "AI: high confidence" : "Please double-check the amounts"}</span>
              {ai.auditing ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium opacity-80">
                  <Loader2 className="size-3 animate-spin" /> reading again…
                </span>
              ) : ai.verification?.checked ? (
                <span className="text-xs font-medium opacity-80">read twice ✓</span>
              ) : null}
            </div>
            {ai.notes && <div className="opacity-80 text-xs mt-0.5">{ai.notes}</div>}
            {ai.verification?.checked && ai.verification.corrections.length > 0 && (
              <div className="mt-1.5">
                <ul className="text-xs space-y-0.5 opacity-90">
                  {ai.verification.corrections.slice(0, 4).map((c, i) => (
                    <li key={i}>
                      2nd read: <b>{c.field}</b> {c.from ?? "—"} → <b>{c.to ?? "—"}</b> <span className="opacity-70">({c.why})</span>
                    </li>
                  ))}
                </ul>
                {ai.suggestion && (
                  <button
                    type="button"
                    onClick={() => setV(applyCashRate(ai.suggestion!, cashRate))}
                    className="mt-2 h-8 px-3 rounded-full bg-brand text-brand-ink text-xs font-bold active:scale-95 transition"
                  >
                    Apply the fixes
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Amounts */}
      <div className="bg-card rounded-2xl shadow-card border border-line/60 p-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">MYR</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-bold text-ink-3">RM</span>
              <input
                inputMode="decimal"
                placeholder="0.00"
                value={v.amount_myr}
                onChange={(e) => editMyr(e.target.value)}
                className="w-full min-w-0 bg-transparent text-3xl font-bold tabular-nums outline-none placeholder:text-ink-3/50"
              />
            </div>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">RMB</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-bold text-ink-3">¥</span>
              <input
                inputMode="decimal"
                placeholder="0.00"
                value={v.amount_rmb}
                onChange={(e) => editRmb(e.target.value)}
                className="w-full min-w-0 bg-transparent text-3xl font-bold tabular-nums outline-none placeholder:text-ink-3/50"
              />
            </div>
          </label>
        </div>
        <div className="flex items-center gap-2 mt-3 text-sm text-ink-2">
          <span>Rate</span>
          <input
            inputMode="decimal"
            placeholder="1.60"
            value={v.rate}
            onChange={(e) => editRate(e.target.value)}
            className="w-24 h-8 px-2 rounded-lg bg-card-2 text-ink tabular-nums outline-none focus:ring-2 ring-brand/40"
          />
          <span className="text-xs text-ink-3">
            {v.rate_source === "computed" && `¥${fmtRate(num(v.rate))} per RM1 · from both amounts`}
            {v.rate_source === "screenshot" && "read from screenshot"}
            {v.rate_source === "cash_fixed" && "your cash rate"}
            {v.rate_source === "manual" && "typed"}
            {!v.rate_source && "RMB per RM1"}
          </span>
        </div>
      </div>

      {/* Description */}
      <div>
        <Field label="What was it?">
          <Input
            value={v.description}
            onChange={(e) => patch({ description: e.target.value })}
            placeholder={v.kind === "transfer" ? "Transfer to …" : "e.g. Didi - hotel to airport"}
            className="text-[17px] font-medium"
          />
        </Field>
      </div>

      {v.kind === "expense" && (
        <div>
          <Field label="For">
            <Chips options={PURPOSES} value={v.purpose} onChange={(p) => patch({ purpose: p as Purpose })} />
          </Field>
        </div>
      )}

      {/* AI-filled details at a glance — tap any to fix */}
      {v.kind === "expense" && !more && (
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: "f-date", text: `📅 ${v.date === today ? "Today" : fmtDateShort(v.date)}` },
            { id: "f-category", text: `${optionEmoji(CATEGORIES, v.category)} ${optionLabel(CATEGORIES, v.category).split(" ")[0]}` },
            ...(v.platform ? [{ id: "f-platform", text: `${optionEmoji(PLATFORMS, v.platform)} ${optionLabel(PLATFORMS, v.platform).split(" ")[0]}` }] : []),
            { id: "f-payment", text: v.payment_method ? `${optionEmoji(PAYMENT_METHODS, v.payment_method)} ${optionLabel(PAYMENT_METHODS, v.payment_method).split(" ")[0]}` : "💳 Paid with?" },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => jumpTo(p.id)}
              className="h-8 px-2.5 rounded-full bg-card-2 text-ink-2 text-[13px] font-medium active:scale-95 transition"
            >
              {p.text}
            </button>
          ))}
        </div>
      )}

      {v.kind === "transfer" && (
        <Field label="To whom">
          <Select
            value={v.to_user_id ?? ""}
            onChange={(e) => {
              const id = e.target.value || null;
              const name = members.find((m) => m.id === id)?.name;
              patch({ to_user_id: id, description: name && /^Transfer to\b/.test(v.description) ? `Transfer to ${name}` : v.description });
            }}
          >
            <option value="">Choose a teammate…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {isLate && (
        <div className="rounded-2xl bg-amber-soft text-amber p-3.5 text-sm">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4" /> Logging a past day ({v.date})
          </div>
          <p className="text-xs opacity-80 mt-0.5 mb-2">Claims should be logged the same day. Tell your lead why this one is late.</p>
          <Select value={v.late_reason ?? ""} onChange={(e) => patch({ late_reason: e.target.value || null })} className="h-10 bg-card">
            <option value="">Reason…</option>
            {LATE_REASONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
      )}

      {/* More */}
      <button
        type="button"
        onClick={() => setMore((m) => !m)}
        className="w-full flex items-center justify-between text-sm font-semibold text-ink-2 py-1"
      >
        <span>More details</span>
        <ChevronDown className={cn("size-4 transition", more && "rotate-180")} />
      </button>
      {more && (
        <div className="space-y-5 anim-rise">
          <Field label="Type">
            <Chips
              options={[
                { id: "expense", label: "Expense", emoji: "🧾" },
                { id: "transfer", label: "Transfer to teammate", emoji: "🔁" },
                { id: "cash_in", label: "Petty cash received", emoji: "💵" },
              ]}
              value={v.kind}
              onChange={(k) => setKind(k as ClaimKind)}
            />
          </Field>
          <div id="f-date">
            <Field label="Date">
              <Input type="date" value={v.date} max={today} onChange={(e) => patch({ date: e.target.value })} />
            </Field>
          </div>
          {v.kind === "expense" && (
            <div id="f-category">
              <Field label="Category">
                <Chips
                  options={CATEGORIES.filter((c) => c.id !== "transfer" && c.id !== "cash_in")}
                  value={v.category}
                  onChange={(c) => patch({ category: c })}
                />
              </Field>
            </div>
          )}
          {v.kind === "expense" && (
            <div id="f-platform">
              <Field label="Platform">
                <Chips options={PLATFORMS} value={v.platform} onChange={(p) => patch({ platform: p })} />
              </Field>
            </div>
          )}
          <div id="f-payment">
            <Field label="Paid with">
              <Chips options={PAYMENT_METHODS} value={v.payment_method} onChange={(p) => patch({ payment_method: p })} />
            </Field>
          </div>
          {v.kind === "expense" && (
            <Field label="Merchant (optional)">
              <Input value={v.merchant} onChange={(e) => patch({ merchant: e.target.value })} placeholder="Shop / app name" />
            </Field>
          )}
          {v.kind !== "expense" && (
            <Field label="Note (optional)">
              <Textarea value={v.merchant} onChange={(e) => patch({ merchant: e.target.value })} placeholder="Anything your lead should know" />
            </Field>
          )}
        </div>
      )}

      {err && <p className="text-sm font-medium text-rose">{err}</p>}

      <div>
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          {submitLabel ?? (mode === "edit" ? "Save changes" : v.kind === "transfer" && toUser ? `Submit transfer to ${toUser.name}` : "Submit claim")}
        </Button>
        <p className="text-center text-xs text-ink-3 mt-2">Goes to Management approval</p>
      </div>
    </form>
  );
}
