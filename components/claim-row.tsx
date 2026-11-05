"use client";

import { CATEGORIES, PAYMENT_METHODS, optionEmoji, optionLabel } from "@/lib/constants";
import type { ClaimWithPeople } from "@/lib/types";
import { cn, fmtDateShort, fmtMYR, fmtRMB, moneyDirection, todayISO } from "@/lib/utils";
import { ArrowDownLeft, ArrowUpRight, Clock } from "lucide-react";
import Link from "next/link";

export function ClaimRow({ claim, viewerId, showPerson }: { claim: ClaimWithPeople; viewerId: string; showPerson?: boolean }) {
  const dir = moneyDirection(claim, viewerId);
  const isIn = dir === "in";
  const emoji =
    claim.kind === "transfer" ? "🔁" : claim.kind === "cash_in" ? "💵" : optionEmoji(CATEGORIES, claim.category);
  const dateLabel = claim.date === todayISO() ? "Today" : fmtDateShort(claim.date);
  const sub = [
    showPerson ? claim.user.name : null,
    dateLabel,
    claim.kind === "transfer"
      ? isIn
        ? `from ${claim.user.name}`
        : `to ${claim.to_user?.name ?? "teammate"}`
      : optionLabel(PAYMENT_METHODS, claim.payment_method).split(" ")[0] || null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link href={`/claims/${claim.id}`} className="flex items-center gap-3 py-3 active:bg-card-2 -mx-2 px-2 rounded-xl transition">
      <div className={cn("size-11 rounded-2xl grid place-items-center text-xl shrink-0", isIn ? "bg-green-soft" : "bg-card-2")}>{emoji}</div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold truncate leading-tight">{claim.description}</div>
        <div className="text-xs text-ink-3 mt-0.5 flex items-center gap-1.5 flex-wrap">
          <span className="truncate">{sub}</span>
          {claim.is_late && (
            <span className="inline-flex items-center gap-0.5 text-amber font-semibold">
              <Clock className="size-3" /> late
            </span>
          )}
        </div>
        {claim.status !== "pending" && (
          <span
            className={cn(
              "inline-block mt-1 text-[11px] font-bold px-2 py-0.5 rounded-full",
              claim.status === "approved" ? "bg-green-soft text-green" : "bg-rose-soft text-rose",
            )}
          >
            {claim.status === "approved" ? "Approved" : "Rejected"}
          </span>
        )}
      </div>
      <div className="text-right shrink-0">
        <div className={cn("font-semibold tabular-nums flex items-center justify-end gap-0.5", isIn && "text-green")}>
          {isIn ? <ArrowDownLeft className="size-3.5" /> : dir === "out" && claim.kind !== "expense" ? <ArrowUpRight className="size-3.5" /> : null}
          {fmtMYR(claim.amount_myr)}
        </div>
        {claim.amount_rmb != null && <div className="text-xs text-ink-3 tabular-nums">{fmtRMB(claim.amount_rmb)}</div>}
      </div>
    </Link>
  );
}

export function ClaimRowSkeleton() {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="size-11 rounded-2xl skeleton" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-2/3 rounded skeleton" />
        <div className="h-3 w-1/3 rounded skeleton" />
      </div>
      <div className="h-4 w-16 rounded skeleton" />
    </div>
  );
}
