"use client";

import { ClaimRow, ClaimRowSkeleton } from "@/components/claim-row";
import { useApp } from "@/components/providers";
import { Card, Empty, PageHeader, useToast } from "@/components/ui";
import { listClaims } from "@/lib/data";
import type { ClaimWithPeople } from "@/lib/types";
import { useAsync } from "@/lib/use-async";
import { cn, fmtDateShort, fmtMYR, todayISO } from "@/lib/utils";
import { useMemo, useState } from "react";

type Filter = "all" | "pending" | "approved" | "rejected";

export default function ClaimsPage() {
  const { profile, trip, isReviewer } = useApp();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [scope, setScope] = useState<"mine" | "all">("mine");

  const { data: claims, error } = useAsync<ClaimWithPeople[] | null>(
    () => (trip ? listClaims({ tripId: trip.id, userId: scope === "mine" ? profile.id : undefined }) : Promise.resolve(null)),
    [trip?.id, profile.id, scope],
  );
  if (error) toast(error.message ?? "Could not load", "err");

  const groups = useMemo(() => {
    const list = (claims ?? []).filter((c) => filter === "all" || c.status === filter);
    const map = new Map<string, ClaimWithPeople[]>();
    for (const c of list) map.set(c.date, [...(map.get(c.date) ?? []), c]);
    return [...map.entries()];
  }, [claims, filter]);

  const total = useMemo(
    () =>
      (claims ?? [])
        .filter((c) => c.status !== "rejected" && c.kind === "expense" && (scope === "all" || c.user_id === profile.id))
        .reduce((s, c) => s + (c.amount_myr ?? 0), 0),
    [claims, scope, profile.id],
  );

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "pending", label: "Pending" },
    { id: "approved", label: "Approved" },
    { id: "rejected", label: "Rejected" },
  ];

  return (
    <main>
      <PageHeader
        title="Claims"
        subtitle={trip ? `${trip.code} · ${scope === "mine" ? "my expenses" : "everyone"} ${fmtMYR(total)}` : undefined}
        right={
          isReviewer && (
            <div className="flex rounded-full bg-card-2 p-0.5 text-xs font-semibold">
              {(["mine", "all"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={cn("px-3 h-8 rounded-full transition", scope === s ? "bg-card shadow-sm text-ink" : "text-ink-3")}
                >
                  {s === "mine" ? "Mine" : "Everyone"}
                </button>
              ))}
            </div>
          )
        }
      />
      <div className="px-5 flex gap-2 overflow-x-auto pb-1 -mx-0">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "h-9 px-4 rounded-full text-sm font-semibold border whitespace-nowrap transition",
              filter === f.id ? "bg-ink text-bg border-ink" : "bg-card text-ink-2 border-line",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="px-5 mt-4 space-y-4">
        {!trip ? (
          <Empty emoji="🧳" title="No trip selected" />
        ) : claims === null ? (
          <Card className="px-4 py-1">
            <ClaimRowSkeleton />
            <ClaimRowSkeleton />
            <ClaimRowSkeleton />
          </Card>
        ) : groups.length === 0 ? (
          <Empty emoji="🗂️" title="Nothing here" hint={filter === "all" ? "Scan a receipt to add your first claim." : `No ${filter} claims.`} />
        ) : (
          groups.map(([date, items]) => {
            const daySum = items.filter((c) => c.status !== "rejected" && c.kind === "expense").reduce((s, c) => s + (c.amount_myr ?? 0), 0);
            return (
              <section key={date} className="anim-rise">
                <div className="flex items-center justify-between px-1 mb-1.5">
                  <span className="text-xs font-bold uppercase tracking-wide text-ink-3">{date === todayISO() ? "Today" : fmtDateShort(date)}</span>
                  <span className="text-xs font-semibold text-ink-3 tabular-nums">{fmtMYR(daySum)}</span>
                </div>
                <Card className="px-4 py-1">
                  <div className="divide-y divide-line">
                    {items.map((c) => (
                      <ClaimRow key={c.id} claim={c} viewerId={profile.id} showPerson={scope === "all"} />
                    ))}
                  </div>
                </Card>
              </section>
            );
          })
        )}
      </div>
    </main>
  );
}
