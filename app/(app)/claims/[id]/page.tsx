"use client";

import { ClaimForm, valuesFromClaim, type ClaimFormOutput } from "@/components/claim-form";
import { useApp } from "@/components/providers";
import { Avatar, Badge, Button, Empty, Sheet, Spinner, StatusBadge, useToast } from "@/components/ui";
import { CATEGORIES, PAYMENT_METHODS, PLATFORMS, PURPOSES, optionEmoji, optionLabel } from "@/lib/constants";
import { deleteClaim, getClaim, receiptUrl, reviewClaim, updateClaim } from "@/lib/data";
import type { ClaimWithPeople } from "@/lib/types";
import { fmtDateDMY, fmtMYR, fmtRMB, fmtRate } from "@/lib/utils";
import { useAsync } from "@/lib/use-async";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

export default function ClaimDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile, isReviewer, isAdmin } = useApp();
  const router = useRouter();
  const toast = useToast();
  const { data: claim, loading, reload } = useAsync<ClaimWithPeople | null>(() => getClaim(id).catch(() => null), [id]);
  const { data: urls } = useAsync<Record<string, string>>(async () => {
    if (!claim?.images?.length) return {};
    const entries = await Promise.all(claim.images.map(async (im) => [im.id, await receiptUrl(im.storage_path).catch(() => "")] as const));
    return Object.fromEntries(entries);
  }, [claim?.id, claim?.images?.length]);
  const [editing, setEditing] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);

  if (loading)
    return (
      <main className="grid place-items-center min-h-[60dvh]">
        <Spinner />
      </main>
    );
  if (!claim) return <Empty emoji="🔍" title="Claim not found" />;

  const mine = claim.user_id === profile.id;
  const editable = mine && claim.status === "pending";
  const canReview = isReviewer && claim.status === "pending" && (!mine || isAdmin);

  async function review(status: "approved" | "rejected") {
    let reason: string | undefined;
    if (status === "rejected") {
      const r = window.prompt("Why is this rejected? (the member will see this)");
      if (!r?.trim()) return;
      reason = r.trim();
    }
    try {
      await reviewClaim(claim!.id, status, profile.id, reason);
      if (status === "approved") void fetch("/api/drive/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claimId: claim!.id }) }).catch(() => {});
      toast(status === "approved" ? "Approved ✓" : "Rejected");
      reload();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }
  const kindLabel = claim.kind === "transfer" ? "Transfer" : claim.kind === "cash_in" ? "Petty cash received" : null;
  const url = (imageId: string) => urls?.[imageId] ?? "";

  async function save(out: ClaimFormOutput) {
    await updateClaim(claim!.id, out);
    setEditing(false);
    toast("Saved");
    reload();
  }
  async function remove() {
    if (!confirm("Delete this claim?")) return;
    await deleteClaim(claim!.id);
    toast("Deleted");
    router.replace("/claims");
  }

  const rows: [string, string][] = [
    ["Date", fmtDateDMY(claim.date)],
    ["Category", `${optionEmoji(CATEGORIES, claim.category)} ${optionLabel(CATEGORIES, claim.category)}`],
    ...(claim.platform ? [["Platform", `${optionEmoji(PLATFORMS, claim.platform)} ${optionLabel(PLATFORMS, claim.platform)}`] as [string, string]] : []),
    ...(claim.payment_method ? [["Paid with", optionLabel(PAYMENT_METHODS, claim.payment_method)] as [string, string]] : []),
    ...(claim.kind === "expense" ? [["For", optionLabel(PURPOSES, claim.purpose)] as [string, string]] : []),
    ...(claim.merchant ? [[claim.kind === "expense" ? "Merchant" : "Note", claim.merchant] as [string, string]] : []),
    ...(claim.to_user ? [["To", claim.to_user.name] as [string, string]] : []),
    ["Rate", claim.rate ? `¥${fmtRate(claim.rate)} per RM1${claim.rate_source ? ` · ${claim.rate_source.replace("_", " ")}` : ""}` : "—"],
  ];

  return (
    <main className="pb-10">
      <header className="flex items-center gap-2 px-3 pt-4 pb-2">
        <button type="button" onClick={() => router.back()} className="size-10 grid place-items-center rounded-full hover:bg-card-2" aria-label="Back">
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="font-bold text-lg">Claim</h1>
        <div className="ml-auto flex gap-1">
          {editable && (
            <>
              <button type="button" onClick={() => setEditing(true)} className="size-10 grid place-items-center rounded-full hover:bg-card-2" aria-label="Edit">
                <Pencil className="size-5" />
              </button>
              <button type="button" onClick={remove} className="size-10 grid place-items-center rounded-full hover:bg-card-2 text-rose" aria-label="Delete">
                <Trash2 className="size-5" />
              </button>
            </>
          )}
        </div>
      </header>

      <div className="px-5 space-y-4 anim-rise">
        <div className="bg-card rounded-2xl shadow-card border border-line/60 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={claim.status} />
                {kindLabel && <Badge tone="blue">{kindLabel}</Badge>}
                {claim.is_late && <Badge tone="amber">Late{claim.late_reason ? ` · ${claim.late_reason.replace("_", " ")}` : ""}</Badge>}
              </div>
              <h2 className="text-xl font-bold mt-3 break-words">{claim.description}</h2>
            </div>
            <Avatar name={claim.user.name} color={claim.user.color} size={40} />
          </div>
          <div className="flex items-baseline gap-3 mt-3">
            <span className="text-3xl font-bold tabular-nums">{fmtMYR(claim.amount_myr)}</span>
            <span className="text-ink-3 tabular-nums text-lg">{fmtRMB(claim.amount_rmb)}</span>
          </div>
          {canReview && (
            <div className="grid grid-cols-2 gap-2 mt-4">
              <Button variant="secondary" className="text-rose" onClick={() => review("rejected")}>
                ✗ Reject
              </Button>
              <Button onClick={() => review("approved")}>✓ Approve</Button>
            </div>
          )}
          {claim.status === "rejected" && claim.reject_reason && (
            <div className="mt-3 rounded-xl bg-rose-soft text-rose text-sm p-3">
              <span className="font-semibold">Rejected:</span> {claim.reject_reason}
            </div>
          )}
          {claim.status !== "pending" && claim.reviewed_at && (
            <p className="text-xs text-ink-3 mt-3">
              {claim.status === "approved" ? "Approved" : "Rejected"} {new Date(claim.reviewed_at).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" })}
            </p>
          )}
        </div>

        {claim.images && claim.images.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {claim.images.map((im) => (
              <button
                key={im.id}
                type="button"
                onClick={() => url(im.id) && setViewer(url(im.id))}
                className="aspect-[3/4] rounded-2xl overflow-hidden bg-card-2"
              >
                {url(im.id) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url(im.id)} alt="Receipt" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full skeleton" />
                )}
              </button>
            ))}
          </div>
        )}

        <div className="bg-card rounded-2xl shadow-card border border-line/60 divide-y divide-line/60">
          {rows.map(([k, val]) => (
            <div key={k} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
              <span className="text-ink-3">{k}</span>
              <span className="font-medium text-right">{val}</span>
            </div>
          ))}
          <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
            <span className="text-ink-3">By</span>
            <span className="font-medium">{claim.user.name}</span>
          </div>
        </div>
      </div>

      <Sheet open={editing} onClose={() => setEditing(false)} title="Edit claim">
        {editing && <ClaimForm initial={valuesFromClaim(claim)} mode="edit" onSubmit={save} />}
      </Sheet>

      {viewer && (
        <div className="fixed inset-0 z-50 bg-black/90 grid place-items-center p-3" onClick={() => setViewer(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewer} alt="Receipt" className="max-h-full max-w-full object-contain rounded-xl" />
        </div>
      )}
    </main>
  );
}
