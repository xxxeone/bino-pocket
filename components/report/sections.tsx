"use client";

import { AnimatedNumber } from "@/components/animated-number";

import { Avatar, Badge, Card, StatusBadge } from "@/components/ui";
import { CATEGORIES, optionEmoji } from "@/lib/constants";
import type { FunStats, PersonTotals, Report } from "@/lib/report";
import { cn, fmtDateShort, fmtMYR, fmtRMB } from "@/lib/utils";
import { ChevronDown, Clock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/* ---------- Hero ---------- */
export function Hero({
  report,
  includePending,
  onToggle,
}: {
  report: Report;
  includePending: boolean;
  onToggle: (v: boolean) => void;
}) {
  const { totals, budget } = report;
  const pct = budget.used_pct;
  const barPct = pct == null ? null : Math.min(100, pct);
  return (
    <Card className="p-5 anim-rise">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold text-ink-2">Total spent</span>
        <div className="flex rounded-full bg-card-2 p-0.5 text-xs font-semibold" role="tablist" aria-label="Figures">
          {[
            { v: false, label: "Approved" },
            { v: true, label: "Incl. pending" },
          ].map((o) => (
            <button
              key={String(o.v)}
              role="tab"
              aria-selected={includePending === o.v}
              onClick={() => onToggle(o.v)}
              className={cn(
                "h-7 px-3 rounded-full transition",
                includePending === o.v ? "bg-card text-ink shadow-sm" : "text-ink-3",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 text-[38px] font-extrabold tracking-tight tabular-nums leading-none">
        <AnimatedNumber value={totals.spent_myr} format={fmtMYR} />
      </div>
      <div className="text-[13px] text-ink-3 mt-2 flex items-center gap-2 flex-wrap">
        <span>≈ {fmtRMB(totals.spent_rmb)}</span>
        <span>·</span>
        <span>
          {totals.items} item{totals.items === 1 ? "" : "s"}
        </span>
        {totals.pending_count > 0 && (
          <Link href="/review" className="ml-auto">
            <Badge tone="amber">
              <Clock className="size-3" /> {totals.pending_count} pending
            </Badge>
          </Link>
        )}
      </div>
      {budget.budget_myr != null && (
        <div className="mt-4">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-ink-2">Budget {fmtMYR(budget.budget_myr)}</span>
            <span className={cn(pct != null && pct > 100 ? "text-rose" : pct != null && pct > 80 ? "text-amber" : "text-brand")}>
              {pct}% used
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-card-2 overflow-hidden mt-1.5">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700",
                pct != null && pct > 100 ? "bg-rose" : pct != null && pct > 80 ? "bg-amber" : "bg-brand",
              )}
              style={{ width: `${barPct ?? 0}%` }}
            />
          </div>
          <div className="text-xs text-ink-3 mt-1.5">
            {budget.remaining_myr != null && budget.remaining_myr >= 0
              ? `${fmtMYR(budget.remaining_myr)} left`
              : `${fmtMYR(Math.abs(budget.remaining_myr ?? 0))} over budget`}
          </div>
        </div>
      )}
    </Card>
  );
}

/* ---------- People ---------- */
export function PeopleList({ report }: { report: Report }) {
  const [open, setOpen] = useState<string | null>(null);
  const people = report.people.filter(
    (p) => p.items_count || p.pending_count || p.cash_in_myr || p.transfers_in_myr || p.rejected_count,
  );
  if (!people.length) return null;
  return (
    <section className="mt-5">
      <h2 className="px-1 text-sm font-bold text-ink-2 mb-2">By person</h2>
      <Card className="divide-y divide-line/70 overflow-hidden">
        {people.map((p) => (
          <PersonRow key={p.user.id} p={p} open={open === p.user.id} onToggle={() => setOpen(open === p.user.id ? null : p.user.id)} />
        ))}
      </Card>
    </section>
  );
}

function PersonRow({ p, open, onToggle }: { p: PersonTotals; open: boolean; onToggle: () => void }) {
  const out = p.expenses_myr + p.transfers_out_myr;
  const inn = p.cash_in_myr + p.transfers_in_myr;
  return (
    <div>
      <button onClick={onToggle} className="w-full flex items-center gap-3 p-4 text-left active:bg-card-2 transition" aria-expanded={open}>
        <Avatar name={p.user.name} color={p.user.color} size={40} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold flex items-center gap-2">
            <span className="truncate">{p.user.name}</span>
            {p.pending_count > 0 && <Badge tone="amber">{p.pending_count} pending</Badge>}
          </div>
          <div className="text-xs text-ink-3 mt-0.5 tabular-nums">
            out {fmtMYR(out)}
            {inn > 0 && <> · in {fmtMYR(inn)}</>}
            {p.late_count > 0 && <> · {p.late_count} late</>}
          </div>
        </div>
        <div className="text-right">
          <div className={cn("font-bold tabular-nums", p.balance_myr < 0 ? "text-ink" : "text-green")}>
            {p.balance_myr < 0 ? "−" : "+"}
            {fmtMYR(Math.abs(p.balance_myr))}
          </div>
          <div className="text-[11px] text-ink-3">balance</div>
        </div>
        <ChevronDown className={cn("size-4 text-ink-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="bg-card-2/60 px-4 pb-3 anim-rise">
          <div className="grid grid-cols-3 gap-2 py-3 text-center">
            <Stat label="Expenses" value={fmtMYR(p.expenses_myr)} sub={fmtRMB(p.expenses_rmb)} />
            <Stat label="Transfers out" value={fmtMYR(p.transfers_out_myr)} />
            <Stat label="Received" value={fmtMYR(inn)} />
          </div>
          <div className="divide-y divide-line/60 rounded-xl bg-card overflow-hidden">
            {p.claims.length === 0 && <div className="p-3 text-sm text-ink-3">No claims</div>}
            {p.claims.map((c) => (
              <Link key={c.id} href={`/claims/${c.id}`} className="flex items-center gap-3 p-3 active:bg-card-2 transition">
                <span className="text-lg w-7 text-center">
                  {c.kind === "transfer" ? "🔁" : c.kind === "cash_in" ? "💵" : optionEmoji(CATEGORIES, c.category)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {c.kind === "transfer" ? `Transfer to ${c.to_user?.name ?? "teammate"}` : c.description}
                  </div>
                  <div className="text-[11px] text-ink-3 flex items-center gap-1.5">
                    {fmtDateShort(c.date)}
                    {c.is_late && <span className="text-amber">· late</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className={cn("text-sm font-semibold tabular-nums", c.status === "rejected" && "line-through text-ink-3")}>
                    {c.amount_myr != null ? fmtMYR(Number(c.amount_myr)) : fmtRMB(Number(c.amount_rmb))}
                  </div>
                  {c.status !== "approved" && (
                    <div className="mt-0.5">
                      <StatusBadge status={c.status} />
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide font-semibold text-ink-3">{label}</div>
      <div className="text-sm font-bold tabular-nums mt-0.5">{value}</div>
      {sub && <div className="text-[10px] text-ink-3 tabular-nums">{sub}</div>}
    </div>
  );
}

/* ---------- Bars ---------- */
export function CategoryBars({ report }: { report: Report }) {
  if (!report.byCategory.length) return null;
  const max = Math.max(...report.byCategory.map((b) => b.myr), 1);
  return (
    <section className="mt-5">
      <h2 className="px-1 text-sm font-bold text-ink-2 mb-2">By category</h2>
      <Card className="p-4 space-y-3">
        {report.byCategory.map((b) => (
          <div key={b.id}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium truncate">
                <span className="mr-1.5">{b.emoji}</span>
                {b.label}
              </span>
              <span className="tabular-nums text-ink-2 shrink-0 ml-3">
                <span className="font-semibold text-ink">{fmtMYR(b.myr)}</span> · {b.pct}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-card-2 overflow-hidden mt-1.5">
              <div className="h-full rounded-full bg-brand/85" style={{ width: `${Math.max(2, (b.myr / max) * 100)}%` }} />
            </div>
          </div>
        ))}
        {report.byPurpose.length > 0 && (
          <div className="pt-2 flex flex-wrap gap-2">
            {report.byPurpose.map((b) => (
              <Badge key={b.id} tone="neutral">
                {b.emoji} {b.label.split(" ")[0]} {fmtMYR(b.myr)}
              </Badge>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}

export function DayBars({ report }: { report: Report }) {
  if (!report.byDay.length) return null;
  const max = Math.max(...report.byDay.map((d) => d.myr), 1);
  const n = report.byDay.length;
  const every = Math.max(1, Math.ceil(n / 6));
  const dm = (iso: string) => {
    const [, m, d] = iso.split("-");
    return `${Number(d)}/${Number(m)}`;
  };
  return (
    <section className="mt-5">
      <h2 className="px-1 text-sm font-bold text-ink-2 mb-2">By day</h2>
      <Card className="p-4">
        <div className="flex items-end gap-1 h-28">
          {report.byDay.map((d, i) => {
            const showLabel = i % every === 0 || i === n - 1;
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full min-w-0" title={`${fmtDateShort(d.date)} · ${fmtMYR(d.myr)}`}>
                {n <= 8 && <div className="text-[9px] text-ink-3 tabular-nums mb-1 truncate max-w-full">{Math.round(d.myr)}</div>}
                <div className="w-full rounded-t-md bg-brand/80" style={{ height: `${Math.max(4, (d.myr / max) * 80)}%` }} />
                <div className={cn("text-[9px] text-ink-3 mt-1 whitespace-nowrap tabular-nums", !showLabel && "invisible")}>{dm(d.date)}</div>
              </div>
            );
          })}
        </div>
        <div className="text-[11px] text-ink-3 mt-2">
          {n} day{n === 1 ? "" : "s"} · busiest {fmtDateShort([...report.byDay].sort((a, b) => b.myr - a.myr)[0].date)}
        </div>
      </Card>
    </section>
  );
}

/* ---------- Fun ---------- */
export function FunCard({ stats }: { stats: FunStats }) {
  const items = [
    stats.mostPunctual && {
      emoji: "🏅",
      label: "Most punctual",
      who: stats.mostPunctual.user,
      detail: stats.mostPunctual.lateRatio === 0 ? "never late" : `${Math.round(stats.mostPunctual.lateRatio * 100)}% late`,
    },
    stats.longestStreak && {
      emoji: "🔥",
      label: "Longest streak",
      who: stats.longestStreak.user,
      detail: `${stats.longestStreak.days} day${stats.longestStreak.days === 1 ? "" : "s"} in a row`,
    },
    stats.foodChampion && { emoji: "🍜", label: "Food champion", who: stats.foodChampion.user, detail: fmtMYR(stats.foodChampion.myr) },
    stats.biggestSingle && {
      emoji: "💸",
      label: "Biggest single",
      who: stats.biggestSingle.user,
      detail: `${fmtMYR(Number(stats.biggestSingle.claim.amount_myr))} · ${stats.biggestSingle.claim.description}`,
    },
  ].filter(Boolean) as { emoji: string; label: string; who: { name: string; color: string }; detail: string }[];
  if (!items.length) return null;
  return (
    <section className="mt-5">
      <h2 className="px-1 text-sm font-bold text-ink-2 mb-2">Hall of fame</h2>
      <Card className="p-2 grid grid-cols-2 gap-1">
        {items.map((it) => (
          <div key={it.label} className="p-3 rounded-xl">
            <div className="text-xl">{it.emoji}</div>
            <div className="text-[11px] font-semibold text-ink-3 mt-1">{it.label}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <Avatar name={it.who.name} color={it.who.color} size={18} />
              <span className="text-sm font-bold truncate">{it.who.name}</span>
            </div>
            <div className="text-[11px] text-ink-2 truncate">{it.detail}</div>
          </div>
        ))}
      </Card>
    </section>
  );
}
