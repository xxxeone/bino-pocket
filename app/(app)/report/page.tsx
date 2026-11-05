"use client";

import { useApp } from "@/components/providers";
import { ExportRow } from "@/components/report/export-row";
import { CategoryBars, DayBars, FunCard, Hero, PeopleList } from "@/components/report/sections";
import { Card, Empty, PageHeader, useToast } from "@/components/ui";
import { listClaims, listTripMembers } from "@/lib/data";
import { buildReport, funStats, toPerson, whatsappDaily, whatsappSummary, type Person } from "@/lib/report";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ClaimWithPeople } from "@/lib/types";
import { useAsync } from "@/lib/use-async";
import { fmtMYR, fmtRMB } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

interface Loaded {
  claims: ClaimWithPeople[];
  members: Person[];
  checkins: { user_id: string; date: string }[];
}

async function loadReport(tripId: string): Promise<Loaded> {
  const [claims, members, ck] = await Promise.all([
    listClaims({ tripId }),
    listTripMembers(tripId),
    supabaseBrowser().from("fin_checkins").select("user_id,date").eq("trip_id", tripId),
  ]);
  return {
    claims,
    members: members.map((m) => toPerson(m.profile)),
    checkins: (ck.data ?? []) as { user_id: string; date: string }[],
  };
}

export default function ReportPage() {
  const { profile, trip, tripsLoading, isReviewer } = useApp();
  const toast = useToast();
  const [includePending, setIncludePending] = useState(true);
  const tripId = trip?.id ?? null;
  const { data, error } = useAsync<Loaded | null>(() => (tripId ? loadReport(tripId) : Promise.resolve(null)), [tripId]);

  useEffect(() => {
    if (error) toast(error.message || "Could not load", "err");
  }, [error, toast]);

  const report = useMemo(() => {
    if (!data || !trip) return null;
    const members = isReviewer ? data.members : [toPerson(profile)];
    return buildReport(data.claims, members, trip, { includePending });
  }, [data, trip, includePending, isReviewer, profile]);

  const fun = useMemo(() => (report && data ? funStats(report, data.checkins) : null), [report, data]);
  const summaryText = useMemo(() => (report && trip ? whatsappSummary(report, trip) : ""), [report, trip]);
  const dailyText = useMemo(() => (data && trip ? whatsappDaily(data.claims, trip) : ""), [data, trip]);

  if (tripsLoading) {
    return (
      <main className="px-5 pt-5 space-y-3">
        <div className="h-8 w-40 rounded skeleton" />
        <div className="h-44 rounded-2xl skeleton" />
        <div className="h-32 rounded-2xl skeleton" />
      </main>
    );
  }
  if (!trip) {
    return (
      <main>
        <PageHeader title="Report" />
        <Empty emoji="🧳" title="No trip selected" hint="Join a trip to see its report." />
      </main>
    );
  }

  if (!isReviewer) {
    const me = report?.people.find((p) => p.user.id === profile.id);
    return (
      <main className="px-5 pb-6">
        <PageHeader title="My summary" subtitle={`${trip.code} · ${trip.name}`} />
        {!report || !me ? (
          <div className="h-44 rounded-2xl skeleton" />
        ) : (
          <>
            <Card className="p-5 anim-rise">
              <div className="text-[13px] font-semibold text-ink-2">My expenses</div>
              <div className="mt-1 text-[36px] font-extrabold tracking-tight tabular-nums leading-none">{fmtMYR(me.expenses_myr)}</div>
              <div className="text-[13px] text-ink-3 mt-2">
                ≈ {fmtRMB(me.expenses_rmb)} · {me.items_count} item{me.items_count === 1 ? "" : "s"}
                {me.pending_count > 0 && ` · ${me.pending_count} pending`}
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                <Mini label="Received" value={fmtMYR(me.cash_in_myr + me.transfers_in_myr)} />
                <Mini label="Transferred" value={fmtMYR(me.transfers_out_myr)} />
                <Mini label="Balance" value={`${me.balance_myr < 0 ? "−" : "+"}${fmtMYR(Math.abs(me.balance_myr))}`} />
              </div>
            </Card>
            <CategoryBars report={report} />
            <DayBars report={report} />
            <ExportRow tripId={trip.id} summaryText={summaryText} dailyText={dailyText} mineOnly />
          </>
        )}
      </main>
    );
  }

  return (
    <main className="px-5 pb-6">
      <PageHeader title="Report" subtitle={`${trip.code} · ${trip.name}`} />
      {!report || !fun ? (
        <div className="space-y-3">
          <div className="h-44 rounded-2xl skeleton" />
          <div className="h-32 rounded-2xl skeleton" />
          <div className="h-32 rounded-2xl skeleton" />
        </div>
      ) : (
        <>
          <Hero report={report} includePending={includePending} onToggle={setIncludePending} />
          {report.totals.items === 0 && report.totals.pending_count === 0 ? (
            <Empty emoji="🧾" title="Nothing logged yet" hint="Claims will show up here as the team scans receipts." />
          ) : (
            <>
              <PeopleList report={report} />
              <CategoryBars report={report} />
              <DayBars report={report} />
              <FunCard stats={fun} />
            </>
          )}
          <ExportRow tripId={trip.id} summaryText={summaryText} dailyText={dailyText} />
        </>
      )}
    </main>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-card-2 py-2">
      <div className="text-[10px] uppercase tracking-wide font-semibold text-ink-3">{label}</div>
      <div className="text-sm font-bold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
