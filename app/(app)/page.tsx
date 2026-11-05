"use client";

import { ClaimRow, ClaimRowSkeleton } from "@/components/claim-row";
import { useApp } from "@/components/providers";
import { OutboxSync } from "@/components/scan/outbox";
import { TripSwitcher } from "@/components/trip-switcher";
import { Avatar, Button, Card, Empty, useToast } from "@/components/ui";
import { checkin, listCheckins, listClaims } from "@/lib/data";
import { useAsync } from "@/lib/use-async";
import { cn, fmtMYR, fmtRMB, streakFrom, todayISO } from "@/lib/utils";
import { CheckCircle2, ChevronRight, Flame, ScanLine, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { InstallBanner } from "@/components/install-banner";
import { AnimatedNumber } from "@/components/animated-number";

export default function HomePage() {
  const { profile, trip, tripsLoading, isReviewer } = useApp();
  const toast = useToast();
  const [checking, setChecking] = useState(false);
  const today = todayISO();
  const hour = useSyncExternalStore(
    () => () => {},
    () => new Date().getHours(),
    () => 12,
  );
  const lateEvening = hour >= 21 || hour < 4;

  const { data, loading, error, setData } = useAsync(
    async () => {
      if (!trip) return null;
      const [claims, ci] = await Promise.all([listClaims({ tripId: trip.id }), listCheckins(trip.id, profile.id)]);
      return { claims, checkins: new Set(ci) };
    },
    [trip?.id, profile.id],
  );
  if (error) console.error(error);

  const claims = data?.claims ?? null;
  const checkins = useMemo(() => data?.checkins ?? new Set<string>(), [data]);

  const stats = useMemo(() => {
    const all = claims ?? [];
    const live = all.filter((c) => c.status !== "rejected");
    const tripSpent = live.filter((c) => c.kind === "expense").reduce((s, c) => s + (c.amount_myr ?? 0), 0);
    const tripSpentRmb = live.filter((c) => c.kind === "expense").reduce((s, c) => s + (c.amount_rmb ?? 0), 0);
    const mine = live.filter((c) => c.user_id === profile.id);
    const mySpent = mine.filter((c) => c.kind === "expense").reduce((s, c) => s + (c.amount_myr ?? 0), 0);
    const pending = all.filter((c) => c.status === "pending").length;
    const todayCount = mine.filter((c) => c.date === today).length;
    const recent = all.filter((c) => c.user_id === profile.id || c.to_user_id === profile.id).slice(0, 5);
    return { tripSpent, tripSpentRmb, mySpent, pending, todayCount, recent };
  }, [claims, profile.id, today]);

  const streak = useMemo(() => streakFrom(checkins), [checkins]);
  const doneToday = checkins.has(today);
  const budget = trip?.budget_myr ?? null;
  const pct = budget ? Math.min(100, Math.round((stats.tripSpent / budget) * 100)) : null;
  const showSkeleton = tripsLoading || (loading && !!trip);

  async function markDone() {
    if (!trip || !data) return;
    setChecking(true);
    try {
      await checkin(trip.id, profile.id, today);
      setData({ ...data, checkins: new Set(data.checkins).add(today) });
      const confetti = (await import("canvas-confetti")).default;
      confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 }, scalar: 0.9, ticks: 120, disableForReducedMotion: true });
      toast(streak + 1 > 1 ? `Day ${streak + 1} in a row 🔥` : "Today is logged ✅");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setChecking(false);
    }
  }

  return (
    <main className="px-5 pt-5">
      <OutboxSync />
      <InstallBanner />
      <header className="flex items-start justify-between">
        <div>
          <TripSwitcher />
          <h1 className="text-[26px] font-bold tracking-tight leading-tight mt-0.5">Hi {profile.name.split(" ")[0]} 👋</h1>
        </div>
        <Link href="/me" aria-label="Me">
          <Avatar name={profile.name} color={profile.color} size={40} />
        </Link>
      </header>

      {showSkeleton ? (
        <div className="mt-5 space-y-3">
          <div className="h-36 rounded-2xl skeleton" />
          <div className="h-20 rounded-2xl skeleton" />
          <div className="h-24 rounded-2xl skeleton" />
        </div>
      ) : !trip ? (
        <Empty
          emoji="🧳"
          title="No trip yet"
          hint={isReviewer ? "Create the trip and add the team." : "Ask the trip lead to add you, then come back here."}
          action={
            isReviewer ? (
              <Link href="/admin/trips">
                <Button size="sm">Create a trip</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Spend card */}
          <Card className="mt-5 p-5 anim-rise">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-ink-2">{isReviewer ? "Trip spent" : "My spent"}</span>
              {stats.pending > 0 && (
                <Link href={isReviewer ? "/review" : "/claims"} className="text-xs font-bold px-2 py-1 rounded-full bg-amber-soft text-amber">
                  {stats.pending} pending
                </Link>
              )}
            </div>
            <div className="mt-1 text-[36px] font-extrabold tracking-tight tabular-nums leading-none">
              <AnimatedNumber value={isReviewer ? stats.tripSpent : stats.mySpent} format={fmtMYR} />
            </div>
            <div className="text-[13px] text-ink-3 mt-2">
              {isReviewer ? (
                <>
                  ≈ {fmtRMB(stats.tripSpentRmb)}
                  {budget && ` · Budget ${fmtMYR(budget)}`}
                </>
              ) : (
                trip.name
              )}
            </div>
            {pct !== null && isReviewer && (
              <div className="h-2.5 rounded-full bg-card-2 overflow-hidden mt-3">
                <div
                  className={cn("h-full rounded-full transition-all duration-700", pct > 100 ? "bg-rose" : pct > 80 ? "bg-amber" : "bg-brand")}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mt-3 anim-rise" style={{ animationDelay: "60ms" }}>
            <Card className="p-4">
              <div className="text-xs font-semibold text-ink-3">{isReviewer ? "My claims" : "Today"}</div>
              <div className="text-[22px] font-extrabold tabular-nums mt-0.5">
                {isReviewer ? <AnimatedNumber value={stats.mySpent} format={fmtMYR} /> : `${stats.todayCount} receipt${stats.todayCount === 1 ? "" : "s"}`}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs font-semibold text-ink-3">Streak</div>
              <div className="text-[22px] font-extrabold tabular-nums mt-0.5 flex items-center gap-1">
                <Flame className={cn("size-5", streak > 0 ? "text-amber fill-amber" : "text-ink-3")} />
                {streak} day{streak === 1 ? "" : "s"}
              </div>
            </Card>
          </div>

          {/* Today */}
          {doneToday ? (
            <Card className="mt-3 p-4 flex items-center gap-3 bg-brand text-brand-ink border-0 anim-rise" style={{ animationDelay: "120ms" }}>
              <CheckCircle2 className="size-7 shrink-0" />
              <div className="flex-1">
                <div className="font-bold">Today is logged</div>
                <div className="text-[13px] opacity-85">
                  {stats.todayCount} receipt{stats.todayCount === 1 ? "" : "s"} today · you can still add more
                </div>
              </div>
              <Link href="/scan" className="size-10 rounded-full bg-white/20 grid place-items-center" aria-label="Scan">
                <ScanLine className="size-5" />
              </Link>
            </Card>
          ) : (
            <Card className="mt-3 p-4 anim-rise" style={{ animationDelay: "120ms" }}>
              <div className="flex items-center gap-3">
                <div className="size-11 rounded-2xl bg-brand-soft text-brand grid place-items-center">
                  <Sparkles className="size-5" />
                </div>
                <div className="flex-1">
                  <div className="font-bold">{lateEvening ? "Before you sleep 🌙" : "Done spending for today?"}</div>
                  <div className="text-[13px] text-ink-3">
                    {stats.todayCount > 0 ? `${stats.todayCount} logged so far.` : lateEvening ? "Nothing logged today yet — scan today's receipts, then" : "Scan your receipts, then"} mark the day as done.
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <Link href="/scan">
                  <Button variant="secondary" className="w-full">
                    <ScanLine className="size-4" /> Scan
                  </Button>
                </Link>
                <Button onClick={markDone} loading={checking}>
                  <CheckCircle2 className="size-4" /> Day done
                </Button>
              </div>
            </Card>
          )}

          {/* Recent */}
          <div className="flex items-center justify-between mt-6 mb-2">
            <h2 className="font-bold">Recent</h2>
            <Link href="/claims" className="text-[13px] font-semibold text-ink-3 inline-flex items-center">
              See all <ChevronRight className="size-4" />
            </Link>
          </div>
          <Card className="px-4 py-1 anim-rise" style={{ animationDelay: "180ms" }}>
            {claims === null ? (
              <>
                <ClaimRowSkeleton />
                <ClaimRowSkeleton />
                <ClaimRowSkeleton />
              </>
            ) : stats.recent.length === 0 ? (
              <Empty
                emoji="🧾"
                title="No claims yet"
                hint="Tap Scan and snap your first receipt."
                action={
                  <Link href="/scan">
                    <Button size="sm">
                      <ScanLine className="size-4" /> Scan a receipt
                    </Button>
                  </Link>
                }
              />
            ) : (
              <div className="divide-y divide-line">
                {stats.recent.map((c) => (
                  <ClaimRow key={c.id} claim={c} viewerId={profile.id} />
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </main>
  );
}
