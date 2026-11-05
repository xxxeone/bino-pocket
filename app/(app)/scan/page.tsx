"use client";

import { ClaimForm, emptyValues, valuesFromScan, type ClaimFormOutput, type ClaimFormValues } from "@/components/claim-form";
import { diffScan } from "@/lib/scan-diff";
import { ImagePicker, type PickedImage } from "@/components/scan/picker";
import { ScanningView } from "@/components/scan/scanning";
import { enqueueOutbox, isNetworkError } from "@/components/scan/outbox";
import { useApp } from "@/components/providers";
import { Button, Empty, useToast } from "@/components/ui";
import { addClaimImages, findSimilarClaims, insertClaim, uploadReceipt, type NewClaim } from "@/lib/data";
import type { ClaimKind, ScanResult } from "@/lib/types";
import { compressImage, fmtMYR, fmtRMB, todayISO } from "@/lib/utils";
import confetti from "canvas-confetti";
import { ArrowLeft, Check, CloudOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { ClaimAi } from "@/components/claim-form";

/** One AI-detected purchase (or the single manual entry). */
interface Draft {
  id: string;
  values: ClaimFormValues;
  ai: ClaimAi | null;
  raw: ScanResult | null;
  imageIds: string[];
  done?: "sent" | "offline" | "skipped";
}

type Step =
  | { s: "pick" }
  | { s: "scanning" }
  | { s: "form"; drafts: Draft[]; active: number; regroup?: Draft[] }
  | { s: "done"; sent: ClaimFormOutput[]; offline: number; skipped: number };

const SHARE_CACHE = "bino-share";

export default function ScanPage() {
  const { profile, trip, membership } = useApp();
  const toast = useToast();
  const router = useRouter();
  const [images, setImages] = useState<PickedImage[]>([]);
  const [step, setStep] = useState<Step>({ s: "pick" });
  const [sent, setSent] = useState<ClaimFormOutput[]>([]);
  const [offlineCount, setOfflineCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const sharePicked = useRef(false);
  const auditRef = useRef<Promise<void> | null>(null);
  const stepRef = useRef<Step>(step);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  // Web Share Target pickup: the service worker stores shared screenshots under /shared/ in the
  // "bino-share" cache and opens /scan?share=1. Read them, scan, then clear the cache.
  useEffect(() => {
    if (sharePicked.current || !trip) return;
    if (typeof window === "undefined" || !new URLSearchParams(window.location.search).has("share")) return;
    if (!("caches" in window)) return;
    sharePicked.current = true;
    void (async () => {
      try {
        const cache = await caches.open(SHARE_CACHE);
        const keys = (await cache.keys()).filter((r) => new URL(r.url).pathname.startsWith("/shared/"));
        const picked: PickedImage[] = [];
        for (const req of keys) {
          const res = await cache.match(req);
          if (!res) continue;
          const blob = await res.blob();
          if (!blob.type.startsWith("image/")) continue;
          const file = new File([blob], new URL(req.url).pathname.split("/").pop() || "shared.jpg", { type: blob.type });
          const { dataUrl, blob: small } = await compressImage(file);
          picked.push({ id: crypto.randomUUID(), dataUrl, blob: small });
        }
        await Promise.all(keys.map((k) => cache.delete(k)));
        window.history.replaceState(null, "", "/scan");
        if (picked.length) {
          setImages(picked);
          void scan(picked);
        }
      } catch (e) {
        toast(e instanceof Error ? e.message : "Could not read shared screenshots", "err");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip]);

  if (!trip) {
    return (
      <main className="pt-6">
        <Empty emoji="🧳" title="No trip yet" hint="Ask your lead to add you to a trip, then come back to scan." action={<Link href="/"><Button variant="secondary">Back home</Button></Link>} />
      </main>
    );
  }

  async function scan(list: PickedImage[] = images) {
    if (!list.length) return;
    setStep({ s: "scanning" });
    const payloadImages = list.map((i) => ({ dataUrl: i.dataUrl }));
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: payloadImages,
          context: { tripId: trip!.id, tripCode: trip!.code, memberCashRate: membership?.cash_rate ?? null, today: todayISO() },
        }),
      });
      const json = (await res.json()) as { claims?: ScanResult[]; issues?: string[]; audit?: unknown; error?: string };
      if (!res.ok || !json.claims?.length) throw new Error(json.error || "Scan failed");

      const drafts = draftsFrom(json.claims, list, true);
      setStep({ s: "form", drafts, active: 0 });

      // Second read runs in the background; the form is already usable.
      auditRef.current = (async () => {
        try {
          const r2 = await fetch("/api/scan/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ images: payloadImages, audit: json.audit, issues: json.issues ?? [] }),
          });
          const j2 = (await r2.json()) as { claims?: ScanResult[]; error?: string };
          if (!r2.ok || !j2.claims?.length) throw new Error(j2.error || "verify failed");
          applyAudit(j2.claims, list);
        } catch (e) {
          console.warn("second read skipped:", e);
          setStep((prev) => (prev.s === "form" ? { ...prev, drafts: prev.drafts.map((d) => (d.ai ? { ...d, ai: { ...d.ai, auditing: false } } : d)) } : prev));
        } finally {
          auditRef.current = null;
        }
      })();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Scan failed — fill it in manually", "err");
      manual("expense", list);
    }
  }

  function draftsFrom(claims: ScanResult[], list: PickedImage[], auditing: boolean): Draft[] {
    const drafts: Draft[] = claims.map((r) => {
      const idx = r.image_indexes?.length ? r.image_indexes : r.images.map((im) => im.index);
      return {
        id: crypto.randomUUID(),
        values: valuesFromScan(r),
        ai: { confidence: r.confidence, notes: r.notes, verification: r.verification, auditing },
        raw: r,
        imageIds: idx.map((i) => list[i]?.id).filter(Boolean) as string[],
      };
    });
    // Any image the AI did not assign goes with the first claim.
    const assigned = new Set(drafts.flatMap((d) => d.imageIds));
    for (const img of list) if (!assigned.has(img.id)) drafts[0].imageIds.push(img.id);
    return drafts;
  }

  /** Merge the second read into the open drafts without touching what the user already typed. */
  function applyAudit(claims2: ScanResult[], list: PickedImage[]) {
    setStep((prev) => {
      if (prev.s !== "form") return prev;
      const anyDone = prev.drafts.some((d) => d.done);
      if (claims2.length !== prev.drafts.length) {
        // The second read grouped the screenshots differently. Offer it as a whole, unless something was already sent.
        if (anyDone) return { ...prev, drafts: prev.drafts.map((d) => (d.ai ? { ...d, ai: { ...d.ai, auditing: false } } : d)) };
        return { ...prev, regroup: draftsFrom(claims2, list, false) };
      }
      const drafts = prev.drafts.map((d, i) => {
        const c = claims2[i];
        if (!d.ai || !c) return d;
        const v = c.verification;
        const mine = (v?.corrections ?? []).filter((x) => prev.drafts.length === 1 || x.field.startsWith(`claim ${i + 1} `));
        const corrections = mine.map((x) => ({ ...x, field: x.field.replace(/^claim \d+ /, "") }));
        return {
          ...d,
          raw: corrections.length ? c : d.raw,
          ai: { ...d.ai, auditing: false, confidence: c.confidence, notes: c.notes ?? d.ai.notes, verification: v ? { ...v, corrections } : d.ai.verification, suggestion: corrections.length ? valuesFromScan(c) : null },
        };
      });
      return { ...prev, drafts };
    });
  }

  function manual(kind: ClaimKind = "expense", list: PickedImage[] = images) {
    const draft: Draft = { id: crypto.randomUUID(), values: emptyValues(kind), ai: null, raw: null, imageIds: list.map((i) => i.id) };
    setStep({ s: "form", drafts: [draft], active: 0 });
  }

  /** Upload this draft's images, insert the claim. Returns "sent" | "offline". */
  async function send(draft: Draft, out: ClaimFormOutput): Promise<"sent" | "offline"> {
    const claim: NewClaim = {
      trip_id: trip!.id,
      user_id: profile.id,
      ...out,
      ai_confidence: draft.raw?.confidence ?? null,
      ai_raw: draft.raw,
      ai_corrections: draft.raw ? diffScan(draft.raw, out) : null,
    };
    const imgs = images.filter((i) => draft.imageIds.includes(i.id));
    // Duplicate guard: same day + same amount already logged by this member (the old sheet had "Didi 4 (duplicate)" rows).
    const dupes = await findSimilarClaims(trip!.id, profile.id, out.date, out.amount_rmb, out.amount_myr).catch(() => []);
    if (dupes.length && !window.confirm(`Looks like a duplicate: "${dupes[0].description}" on ${out.date} for the same amount is already logged. Submit anyway?`)) {
      throw new Error("Not submitted — looks like a duplicate.");
    }
    try {
      const paths: string[] = [];
      for (const img of imgs) paths.push(await uploadReceipt(trip!.id, profile.id, img.blob));
      const row = await insertClaim(claim);
      await addClaimImages(row.id, profile.id, paths);
      return "sent";
    } catch (e) {
      if (isNetworkError(e)) {
        await enqueueOutbox({ claim, images: imgs.map((i) => i.dataUrl) });
        return "offline";
      }
      throw e;
    }
  }

  /** Move to the next unfinished draft, or the Done screen. */
  function advance(drafts: Draft[], from: number, nextSent: ClaimFormOutput[], nextOffline: number, nextSkipped: number) {
    const next = drafts.findIndex((d, i) => i > from && !d.done);
    const any = next >= 0 ? next : drafts.findIndex((d) => !d.done);
    if (any >= 0) {
      setStep({ s: "form", drafts, active: any });
    } else {
      if (nextSent.length > 0 && nextOffline === 0) burst();
      setStep({ s: "done", sent: nextSent, offline: nextOffline, skipped: nextSkipped });
    }
  }

  async function submitActive(out: ClaimFormOutput) {
    if (step.s !== "form") return;
    const { drafts, active } = step;
    const result = await send(drafts[active], out);
    const nextSent = [...sent, out];
    const nextOffline = offlineCount + (result === "offline" ? 1 : 0);
    setSent(nextSent);
    setOfflineCount(nextOffline);
    const updated = drafts.map((d, i) => (i === active ? { ...d, done: result } : d));
    if (updated.some((d) => !d.done)) toast(result === "sent" ? "Submitted ✓" : "Saved offline");
    advance(updated, active, nextSent, nextOffline, skippedCount);
  }

  function skipActive() {
    if (step.s !== "form") return;
    const { drafts, active } = step;
    const nextSkipped = skippedCount + 1;
    setSkippedCount(nextSkipped);
    const updated = drafts.map((d, i) => (i === active ? { ...d, done: "skipped" as const } : d));
    advance(updated, active, sent, offlineCount, nextSkipped);
  }

  /** Submit every remaining draft with its AI values as read. */
  async function submitAllRemaining() {
    if (auditRef.current) {
      toast("Finishing the second read…");
      await auditRef.current;
    }
    const cur = stepRef.current;
    if (cur.s !== "form") return;
    const drafts = [...cur.drafts];
    const todo = drafts.filter((d) => !d.done);
    const invalid = todo.filter((d) => !d.values.description.trim() || (!d.values.amount_myr && !d.values.amount_rmb));
    if (invalid.length) {
      toast("Some claims are missing an amount or description — check them one by one", "err");
      return;
    }
    const nextSent = [...sent];
    let nextOffline = offlineCount;
    for (const d of todo) {
      const out = toOutput(d.values);
      try {
        const r = await send(d, out);
        nextSent.push(out);
        if (r === "offline") nextOffline++;
        drafts[drafts.findIndex((x) => x.id === d.id)] = { ...d, done: r };
      } catch (e) {
        toast(e instanceof Error ? e.message : "Could not submit", "err");
        setSent(nextSent);
        setOfflineCount(nextOffline);
        setStep({ s: "form", drafts, active: drafts.findIndex((x) => x.id === d.id) });
        return;
      }
    }
    setSent(nextSent);
    setOfflineCount(nextOffline);
    advance(drafts, -1, nextSent, nextOffline, skippedCount);
  }

  function reset() {
    setImages([]);
    setSent([]);
    setOfflineCount(0);
    setSkippedCount(0);
    setStep({ s: "pick" });
  }

  const queue = step.s === "form" ? step.drafts : [];
  const remainingAfter = step.s === "form" ? step.drafts.filter((d, i) => i !== step.active && !d.done).length : 0;
  const title =
    step.s === "pick" ? "New claim" : step.s === "scanning" ? "Scanning" : step.s === "form" ? (queue.length > 1 ? `Claim ${step.active + 1} of ${queue.length}` : "Check & submit") : "Submitted";

  return (
    <main className="min-h-dvh pb-10">
      <header className="flex items-center gap-2 px-3 pt-4 pb-2">
        <button
          type="button"
          onClick={() => (step.s === "pick" || step.s === "done" ? router.push("/") : setStep({ s: "pick" }))}
          className="size-10 grid place-items-center rounded-full hover:bg-card-2"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-lg leading-tight">{title}</h1>
          <p className="text-xs text-ink-3">{trip.code}</p>
        </div>
        {step.s === "form" && queue.length > 1 && (
          <button type="button" onClick={skipActive} className="text-sm font-semibold text-ink-3 px-3 h-10 rounded-full hover:bg-card-2">
            Skip
          </button>
        )}
      </header>

      {step.s === "pick" && (
        <>
          <div className="px-5 pb-4 flex gap-2 anim-rise">
            <button type="button" onClick={() => manual("transfer", [])} className="flex-1 h-11 rounded-2xl bg-card border border-line text-sm font-semibold active:scale-[0.98] transition">
              🔁 Transfer to teammate
            </button>
            <button type="button" onClick={() => manual("cash_in", [])} className="flex-1 h-11 rounded-2xl bg-card border border-line text-sm font-semibold active:scale-[0.98] transition">
              💵 Petty cash received
            </button>
          </div>
          <ImagePicker images={images} onChange={setImages} onScan={() => scan()} onAutoScan={(imgs) => scan(imgs)} onManual={() => manual("expense")} />
        </>
      )}

      {step.s === "scanning" && (
        <>
          <ScanningView thumb={images[0]?.dataUrl ?? ""} count={images.length} />
          <div className="px-5 mt-8 text-center">
            <button type="button" onClick={() => setStep({ s: "pick" })} className="text-sm text-ink-3 underline underline-offset-4">
              Cancel
            </button>
          </div>
        </>
      )}

      {step.s === "form" && (
        <div className="px-5">
          {queue.length > 1 && (
            <div className="flex gap-1 mb-3" aria-hidden>
              {queue.map((d, i) => (
                <span
                  key={d.id}
                  className={`h-1.5 flex-1 rounded-full ${i === step.active ? "bg-brand" : d.done && d.done !== "skipped" ? "bg-green" : d.done === "skipped" ? "bg-line" : "bg-card-2"}`}
                />
              ))}
            </div>
          )}
          {step.regroup && (
            <div className="mb-3 rounded-2xl bg-amber-soft text-amber px-4 py-3 text-sm anim-pop">
              <div className="font-semibold">Second read sees {step.regroup.length} purchase{step.regroup.length === 1 ? "" : "s"} instead of {step.drafts.length}.</div>
              <div className="flex gap-2 mt-2">
                <button type="button" className="h-9 px-3 rounded-full bg-amber text-white font-semibold" onClick={() => setStep({ s: "form", drafts: step.regroup!, active: 0 })}>
                  Use that
                </button>
                <button type="button" className="h-9 px-3 rounded-full bg-card text-ink font-semibold" onClick={() => setStep({ ...step, regroup: undefined })}>
                  Keep mine
                </button>
              </div>
            </div>
          )}
          <Thumbs images={images.filter((i) => step.drafts[step.active].imageIds.includes(i.id))} />
          <ClaimForm key={step.drafts[step.active].id} initial={step.drafts[step.active].values} mode="create" ai={step.drafts[step.active].ai} onSubmit={submitActive} />
          {remainingAfter > 0 && (
            <button type="button" onClick={submitAllRemaining} className="w-full mt-4 text-sm font-semibold text-brand underline underline-offset-4 py-2">
              Submit all {remainingAfter + 1} as read by AI
            </button>
          )}
        </div>
      )}

      {step.s === "done" && <Done sent={step.sent} offline={step.offline} skipped={step.skipped} onAgain={reset} onHome={() => router.push("/")} />}
    </main>
  );
}

function toOutput(v: ClaimFormValues): ClaimFormOutput {
  const n = (s: string) => {
    const x = parseFloat(String(s).replace(/[^\d.]/g, ""));
    return Number.isFinite(x) && x > 0 ? x : null;
  };
  const today = todayISO();
  const date = v.date || today;
  return {
    kind: v.kind,
    date,
    description: v.description.trim(),
    category: v.category,
    platform: v.platform,
    payment_method: v.payment_method,
    purpose: v.purpose,
    amount_rmb: n(v.amount_rmb),
    amount_myr: n(v.amount_myr),
    rate: n(v.rate),
    rate_source: n(v.rate) ? v.rate_source : null,
    merchant: v.merchant.trim() || null,
    to_user_id: v.kind === "transfer" ? v.to_user_id : null,
    is_late: date < today,
    late_reason: date < today ? (v.late_reason ?? "other") : null,
  };
}

function Thumbs({ images }: { images: PickedImage[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!images.length) return null;
  return (
    <>
      <div className="flex gap-2 mb-4 overflow-x-auto py-0.5">
        {images.map((img, i) => (
          <button key={img.id} type="button" onClick={() => setOpen(img.dataUrl)} className="relative shrink-0 rounded-xl overflow-hidden ring-1 ring-line shadow-sm active:scale-95 transition" aria-label={`View screenshot ${i + 1}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.dataUrl} alt="" className="h-20 w-14 object-cover bg-card-2" />
            <span className="absolute bottom-1 left-1 text-[10px] font-bold bg-black/55 text-white rounded-full px-1.5">{i + 1}</span>
          </button>
        ))}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/90 grid place-items-center p-4 anim-pop" onClick={() => setOpen(null)} role="dialog" aria-modal>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={open} alt="Screenshot" className="max-h-full max-w-full rounded-2xl object-contain" />
        </div>
      )}
    </>
  );
}

function burst() {
  try {
    confetti({ particleCount: 70, spread: 60, startVelocity: 35, origin: { y: 0.7 }, scalar: 0.9, ticks: 120, disableForReducedMotion: true });
  } catch {
    /* no canvas */
  }
}

function Done({ sent, offline, skipped, onAgain, onHome }: { sent: ClaimFormOutput[]; offline: number; skipped: number; onAgain: () => void; onHome: () => void }) {
  const allOffline = offline > 0 && offline === sent.length;
  const nothing = sent.length === 0;
  const totalMyr = sent.reduce((s, c) => s + (c.amount_myr ?? 0), 0);
  const totalRmb = sent.reduce((s, c) => s + (c.amount_rmb ?? 0), 0);
  return (
    <div className="px-5 pt-8 text-center anim-pop">
      <div className={`mx-auto size-20 rounded-full grid place-items-center ${allOffline ? "bg-amber-soft text-amber" : nothing ? "bg-card-2 text-ink-3" : "bg-green-soft text-green"}`}>
        {allOffline ? <CloudOff className="size-10" /> : <Check className="size-10" strokeWidth={3} />}
      </div>
      <h2 className="text-2xl font-bold mt-5">{nothing ? "Nothing submitted" : allOffline ? "Saved offline" : sent.length > 1 ? `${sent.length} claims submitted` : "Nice one!"}</h2>
      <p className="text-ink-2 mt-1 text-sm">
        {nothing
          ? "You skipped everything — nothing was sent."
          : allOffline
            ? "No internet right now — they will send themselves when you're back online."
            : offline > 0
              ? `Sent to Management for approval. ${offline} saved offline and will send later.`
              : "Sent to Management for approval."}
        {skipped > 0 && !nothing && ` ${skipped} skipped.`}
      </p>
      {sent.length > 0 && (
        <div className="bg-card rounded-2xl shadow-card border border-line/60 mt-6 text-left divide-y divide-line/60">
          {sent.map((c, i) => (
            <div key={i} className="p-4">
              <div className="font-semibold">{c.description}</div>
              <div className="text-sm text-ink-3 mt-0.5">{c.date}</div>
              <div className="flex items-baseline gap-3 mt-1.5">
                <span className="text-2xl font-bold tabular-nums">{fmtMYR(c.amount_myr)}</span>
                {c.amount_rmb != null && <span className="text-ink-3 tabular-nums">{fmtRMB(c.amount_rmb)}</span>}
              </div>
            </div>
          ))}
          {sent.length > 1 && (
            <div className="p-4 flex items-center justify-between text-sm">
              <span className="text-ink-3">Total</span>
              <span className="font-bold tabular-nums">
                {fmtMYR(totalMyr)} <span className="text-ink-3 font-normal">{fmtRMB(totalRmb)}</span>
              </span>
            </div>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 mt-6">
        <Button variant="secondary" size="lg" onClick={onAgain}>
          Scan another
        </Button>
        <Button size="lg" onClick={onHome}>
          Done
        </Button>
      </div>
    </div>
  );
}
