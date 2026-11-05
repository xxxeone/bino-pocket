"use client";

import { useApp } from "@/components/providers";
import { ClaimRow } from "@/components/review/claim-row";
import { Avatar, Button, Card, Empty, PageHeader, Sheet, Spinner, Textarea, useToast } from "@/components/ui";
import { listClaims, reviewClaim } from "@/lib/data";
import type { ClaimStatus, ClaimWithPeople } from "@/lib/types";
import { useAsync } from "@/lib/use-async";
import { cn, fmtMYR } from "@/lib/utils";
import { CheckCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const TABS: { id: ClaimStatus; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

export default function ReviewPage() {
  const { profile, trip, isReviewer } = useApp();
  const toast = useToast();
  const [tab, setTab] = useState<ClaimStatus>("pending");
  const {
    data,
    loading,
    error,
    setData: setClaims,
  } = useAsync(async () => {
    if (!trip) return [] as ClaimWithPeople[];
    const rows = await listClaims({ tripId: trip.id, status: tab, withImages: true });
    rows.sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
    return rows;
  }, [trip?.id, tab]);
  const claims = useMemo(() => data ?? [], [data]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<ClaimWithPeople | null>(null);
  const [reason, setReason] = useState("");
  const [bulk, setBulk] = useState<{ ids: string[]; label: string } | null>(null);

  useEffect(() => {
    if (error) toast(error.message, "err");
  }, [error, toast]);

  const groups = useMemo(() => {
    const m = new Map<string, { user: ClaimWithPeople["user"]; rows: ClaimWithPeople[] }>();
    for (const c of claims) {
      const g = m.get(c.user_id) ?? { user: c.user, rows: [] };
      g.rows.push(c);
      m.set(c.user_id, g);
    }
    return [...m.values()];
  }, [claims]);

  const canAct = (c: ClaimWithPeople) => tab === "pending" && c.user_id !== profile.id;
  const actionable = claims.filter(canAct);

  async function act(ids: string[], status: "approved" | "rejected", why?: string) {
    setBusy((s) => new Set([...s, ...ids]));
    try {
      await Promise.all(ids.map((id) => reviewClaim(id, status, profile.id, why)));
      if (status === "approved") {
        // Archive the receipts to Google Drive in the background (no-op when Drive isn't connected).
        for (const id of ids) {
          void fetch("/api/drive/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claimId: id }) }).catch(() => {});
        }
      }
      setLeaving((s) => new Set([...s, ...ids]));
      setTimeout(() => {
        setClaims((cs) => (cs ?? []).filter((c) => !ids.includes(c.id)));
        setLeaving((s) => {
          const n = new Set(s);
          ids.forEach((i) => n.delete(i));
          return n;
        });
      }, 300);
      toast(status === "approved" ? `Approved ${ids.length > 1 ? ids.length + " claims" : ""} ✓` : "Rejected");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy((s) => {
        const n = new Set(s);
        ids.forEach((i) => n.delete(i));
        return n;
      });
    }
  }

  if (!isReviewer) {
    return (
      <main>
        <PageHeader title="Review" />
        <Empty emoji="🔒" title="Leads only" hint="Ask your trip lead if you need to review claims." />
      </main>
    );
  }
  if (!trip) {
    return (
      <main>
        <PageHeader title="Review" />
        <Empty emoji="🧳" title="No trip selected" hint="Pick a trip from the Me page." />
      </main>
    );
  }

  return (
    <main>
      <PageHeader
        title="Review"
        subtitle={trip.code}
        right={
          tab === "pending" && actionable.length > 1 ? (
            <Button size="sm" variant="soft" onClick={() => setBulk({ ids: actionable.map((c) => c.id), label: `all ${actionable.length}` })}>
              <CheckCheck className="size-4" /> Approve all ({actionable.length})
            </Button>
          ) : undefined
        }
      />

      <div className="px-5 pb-3">
        <div className="flex bg-card-2 rounded-2xl p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setClaims(null);
                setExpanded(null);
              }}
              className={cn(
                "flex-1 h-10 rounded-xl text-sm font-medium transition",
                tab === t.id ? "bg-card shadow-card text-ink" : "text-ink-3",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading || data === null ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : groups.length === 0 ? (
        <Empty
          emoji={tab === "pending" ? "🎉" : "🗒️"}
          title={tab === "pending" ? "All caught up" : `No ${tab} claims`}
          hint={tab === "pending" ? "Nothing waiting for review." : undefined}
        />
      ) : (
        <div className="px-4 space-y-4 anim-rise">
          {groups.map((g) => {
            const subtotal = g.rows.reduce((s, c) => s + (c.amount_myr ?? 0), 0);
            const groupActionable = g.rows.filter(canAct);
            return (
              <Card key={g.user.id} className="overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 bg-card-2/60">
                  <Avatar name={g.user.name} color={g.user.color} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{g.user.name}</p>
                    <p className="text-xs text-ink-3">
                      {g.rows.length} claim{g.rows.length > 1 ? "s" : ""} · {fmtMYR(subtotal)}
                    </p>
                  </div>
                  {groupActionable.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-green"
                      onClick={() => setBulk({ ids: groupActionable.map((c) => c.id), label: `${groupActionable.length} from ${g.user.name}` })}
                    >
                      Approve all
                    </Button>
                  )}
                </div>
                {g.rows.map((c) => (
                  <ClaimRow
                    key={c.id}
                    claim={c}
                    expanded={expanded === c.id}
                    onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
                    canAct={canAct(c)}
                    busy={busy.has(c.id)}
                    leaving={leaving.has(c.id)}
                    onApprove={() => act([c.id], "approved")}
                    onReject={() => {
                      setReason("");
                      setRejecting(c);
                    }}
                  />
                ))}
              </Card>
            );
          })}
        </div>
      )}

      <Sheet open={!!rejecting} onClose={() => setRejecting(null)} title="Reject claim">
        {rejecting && (
          <div className="space-y-3">
            <p className="text-sm text-ink-2">
              <span className="font-medium text-ink">{rejecting.description}</span> · {fmtMYR(rejecting.amount_myr)}
            </p>
            <Textarea autoFocus placeholder="Why? e.g. receipt unclear, wrong amount…" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button
              variant="danger"
              size="lg"
              className="w-full"
              disabled={!reason.trim()}
              onClick={() => {
                const c = rejecting;
                setRejecting(null);
                void act([c.id], "rejected", reason.trim());
              }}
            >
              Reject
            </Button>
          </div>
        )}
      </Sheet>

      <Sheet open={!!bulk} onClose={() => setBulk(null)} title="Approve all?">
        {bulk && (
          <div className="space-y-4">
            <p className="text-sm text-ink-2">
              This approves <span className="font-semibold text-ink">{bulk.label}</span> pending claim{bulk.ids.length > 1 ? "s" : ""}. You can&apos;t undo this from here.
            </p>
            <Button
              size="lg"
              className="w-full bg-green text-white"
              onClick={() => {
                const ids = bulk.ids;
                setBulk(null);
                void act(ids, "approved");
              }}
            >
              <CheckCheck className="size-5" /> Approve {bulk.ids.length}
            </Button>
          </div>
        )}
      </Sheet>
    </main>
  );
}
