"use client";

import { Badge, Button, StatusBadge } from "@/components/ui";
import { CATEGORIES, PAYMENT_METHODS, PLATFORMS, PURPOSES, optionEmoji, optionLabel } from "@/lib/constants";
import type { ClaimWithPeople } from "@/lib/types";
import { cn, fmtDateShort, fmtMYR, fmtRMB, fmtRate } from "@/lib/utils";
import { Check, ChevronDown, X } from "lucide-react";
import { ReceiptImages } from "./receipt-images";

export function ClaimRow({
  claim,
  expanded,
  onToggle,
  canAct,
  onApprove,
  onReject,
  busy,
  leaving,
}: {
  claim: ClaimWithPeople;
  expanded: boolean;
  onToggle: () => void;
  /** false when read-only (approved/rejected tab) or it's the reviewer's own claim */
  canAct: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  busy?: boolean;
  /** optimistic fade-out */
  leaving?: boolean;
}) {
  const emoji = optionEmoji(CATEGORIES, claim.category);
  return (
    <div
      className={cn(
        "border-b border-line/70 last:border-b-0 transition-all duration-300",
        leaving && "opacity-0 -translate-x-4 max-h-0 overflow-hidden",
      )}
    >
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-card-2 transition">
        <span className="size-10 rounded-xl bg-card-2 grid place-items-center text-xl shrink-0">{emoji}</span>
        <span className="flex-1 min-w-0">
          <span className="block font-medium truncate">{claim.description}</span>
          <span className="flex items-center gap-1.5 text-xs text-ink-3 mt-0.5">
            {fmtDateShort(claim.date)}
            {claim.kind !== "expense" && <Badge tone="blue">{claim.kind === "transfer" ? "Transfer" : "Cash in"}</Badge>}
            {claim.is_late && <Badge tone="amber">Late</Badge>}
          </span>
        </span>
        <span className="text-right shrink-0">
          <span className="block font-semibold tabular-nums">{fmtMYR(claim.amount_myr)}</span>
          {claim.amount_rmb != null && <span className="block text-xs text-ink-3 tabular-nums">{fmtRMB(claim.amount_rmb)}</span>}
        </span>
        <ChevronDown className={cn("size-4 text-ink-3 transition-transform shrink-0", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 anim-rise">
          <ReceiptImages images={claim.images ?? []} className="mb-3" />
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm bg-card-2 rounded-xl p-3">
            <Item k="Category" v={`${emoji} ${optionLabel(CATEGORIES, claim.category)}`} />
            <Item k="Purpose" v={`${optionEmoji(PURPOSES, claim.purpose)} ${optionLabel(PURPOSES, claim.purpose)}`} />
            {claim.platform && <Item k="Platform" v={optionLabel(PLATFORMS, claim.platform)} />}
            {claim.payment_method && <Item k="Paid with" v={optionLabel(PAYMENT_METHODS, claim.payment_method)} />}
            {claim.merchant && <Item k="Merchant" v={claim.merchant} />}
            <Item k="Rate" v={claim.rate ? `${fmtRate(claim.rate)} ${claim.rate_source ? `(${claim.rate_source})` : ""}` : "—"} />
            {claim.to_user && <Item k="To" v={claim.to_user.name} />}
            {claim.is_late && <Item k="Late reason" v={claim.late_reason || "—"} />}
            {claim.ai_confidence && <Item k="AI confidence" v={claim.ai_confidence} />}
            {claim.status !== "pending" && (
              <div className="col-span-2 flex items-center gap-2 pt-1">
                <StatusBadge status={claim.status} />
                {claim.reject_reason && <span className="text-xs text-rose">{claim.reject_reason}</span>}
              </div>
            )}
          </dl>

          {claim.status === "pending" && (
            canAct ? (
              <div className="flex gap-2 mt-3">
                <Button variant="danger" className="flex-1 bg-rose-soft text-rose" onClick={onReject} disabled={busy}>
                  <X className="size-5" /> Reject
                </Button>
                <Button className="flex-[2] bg-green text-white" onClick={onApprove} loading={busy}>
                  <Check className="size-5" /> Approve
                </Button>
              </div>
            ) : (
              <p className="text-xs text-ink-3 text-center mt-3">Your own claim — someone else needs to review it.</p>
            )
          )}
        </div>
      )}
    </div>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-ink-3">{k}</dt>
      <dd className="font-medium truncate">{v}</dd>
    </div>
  );
}
