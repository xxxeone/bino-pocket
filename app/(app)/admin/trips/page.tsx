"use client";

import { useApp } from "@/components/providers";
import { Avatar, Badge, Button, Card, Empty, Field, Input, PageHeader, Select, Sheet, Spinner, useToast } from "@/components/ui";
import { listProfiles, listTripMembers } from "@/lib/data";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Profile, Trip, TripMember } from "@/lib/types";
import { cn, fmtMYR } from "@/lib/utils";
import { ArrowLeft, ChevronDown, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useAsync } from "@/lib/use-async";
import { useEffect, useMemo, useState } from "react";

type Member = TripMember & { profile: Profile };
type TripForm = { code: string; name: string; destination: string; start_date: string; end_date: string; budget_myr: string };
const empty: TripForm = { code: "", name: "", destination: "", start_date: "", end_date: "", budget_myr: "" };

export default function TripsPage() {
  const { isReviewer, isAdmin, profile: me, trips, tripsLoading, refreshTrips, refreshMembership } = useApp();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<TripForm>(empty);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  async function createTrip(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const sb = supabaseBrowser();
    try {
      const { data, error } = await sb
        .from("fin_trips")
        .insert({
          code: form.code.trim().toUpperCase(),
          name: form.name.trim(),
          destination: form.destination.trim() || null,
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          budget_myr: form.budget_myr ? Number(form.budget_myr) : null,
          created_by: me.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: mErr } = await sb.from("fin_trip_members").insert({ trip_id: data.id, user_id: me.id });
      if (mErr) throw mErr;
      toast(`${form.code.toUpperCase()} created`);
      setCreating(false);
      setForm(empty);
      await refreshTrips();
      setOpen(data.id);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setSaving(false);
    }
  }

  if (!isReviewer) {
    return (
      <main>
        <PageHeader title="Trips" />
        <Empty emoji="🔒" title="Leads and admins only" />
      </main>
    );
  }

  return (
    <main>
      <div className="px-4 pt-4">
        <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-ink-3">
          <ArrowLeft className="size-4" /> Admin
        </Link>
      </div>
      <PageHeader
        title="Trips"
        subtitle={`${trips.length} trip${trips.length === 1 ? "" : "s"}`}
        right={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> New
          </Button>
        }
      />
      {tripsLoading ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : trips.length === 0 ? (
        <Empty emoji="🧳" title="No trips yet" action={<Button onClick={() => setCreating(true)}>Create the first trip</Button>} />
      ) : (
        <div className="px-4 space-y-3 anim-rise">
          {trips.map((t) => (
            <TripCard
              key={t.id}
              trip={t}
              open={open === t.id}
              onToggle={() => setOpen(open === t.id ? null : t.id)}
              isAdmin={isAdmin}
              onChanged={async () => {
                await refreshTrips();
                await refreshMembership();
              }}
            />
          ))}
        </div>
      )}

      <Sheet open={creating} onClose={() => setCreating(false)} title="New trip">
        <form className="space-y-3" onSubmit={createTrip}>
          <Field label="Trip code" hint="Short and unique, e.g. PDL10X">
            <Input required autoFocus value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="PDL10X" className="uppercase" />
          </Field>
          <Field label="Name">
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="PDL 10X China Trip" />
          </Field>
          <Field label="Destination">
            <Input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} placeholder="Zhengzhou, China" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start">
              <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </Field>
            <Field label="End">
              <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </Field>
          </div>
          <Field label="Budget (MYR)" hint="Optional. Shows a progress bar for everyone.">
            <Input type="number" inputMode="decimal" min={0} step="0.01" value={form.budget_myr} onChange={(e) => setForm({ ...form, budget_myr: e.target.value })} placeholder="20000" />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={saving}>
            Create trip
          </Button>
        </form>
      </Sheet>
    </main>
  );
}

function TripCard({ trip, open, onToggle, isAdmin, onChanged }: { trip: Trip; open: boolean; onToggle: () => void; isAdmin: boolean; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const { data, error, reload, setData } = useAsync(async () => {
    if (!open) return null;
    const [m, p] = await Promise.all([listTripMembers(trip.id), listProfiles()]);
    m.sort((a, b) => a.profile.name.localeCompare(b.profile.name));
    return { members: m as Member[], people: p.filter((x) => x.active) };
  }, [open, trip.id]);
  const members = data?.members ?? null;
  const people = useMemo(() => data?.people ?? [], [data]);
  const setMembers = (fn: (ms: Member[] | null) => Member[]) => setData((d) => (d ? { ...d, members: fn(d.members) } : d));
  const load = async () => reload();
  useEffect(() => {
    if (error) toast(error.message, "err");
  }, [error, toast]);
  const [addId, setAddId] = useState("");
  const [edit, setEdit] = useState<TripForm>({
    code: trip.code,
    name: trip.name,
    destination: trip.destination ?? "",
    start_date: trip.start_date ?? "",
    end_date: trip.end_date ?? "",
    budget_myr: trip.budget_myr?.toString() ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function saveTrip() {
    setSaving(true);
    const { error } = await supabaseBrowser()
      .from("fin_trips")
      .update({
        code: edit.code.trim().toUpperCase(),
        name: edit.name.trim(),
        destination: edit.destination.trim() || null,
        start_date: edit.start_date || null,
        end_date: edit.end_date || null,
        budget_myr: edit.budget_myr ? Number(edit.budget_myr) : null,
      })
      .eq("id", trip.id);
    setSaving(false);
    if (error) return toast(error.message, "err");
    toast("Trip saved");
    await onChanged();
  }

  async function toggleStatus() {
    const status = trip.status === "active" ? "closed" : "active";
    const { error } = await supabaseBrowser().from("fin_trips").update({ status }).eq("id", trip.id);
    if (error) return toast(error.message, "err");
    toast(status === "closed" ? "Trip closed" : "Trip reopened");
    await onChanged();
  }

  async function addMember() {
    if (!addId) return;
    const { error } = await supabaseBrowser().from("fin_trip_members").insert({ trip_id: trip.id, user_id: addId });
    if (error) return toast(error.message, "err");
    setAddId("");
    toast("Member added");
    await load();
    await onChanged();
  }

  async function removeMember(m: Member) {
    const { error } = await supabaseBrowser().from("fin_trip_members").delete().eq("trip_id", trip.id).eq("user_id", m.user_id);
    if (error) return toast(error.message, "err");
    setMembers((ms) => (ms ?? []).filter((x) => x.user_id !== m.user_id));
    toast(`${m.profile.name} removed`);
    await onChanged();
  }

  async function setRate(m: Member, raw: string) {
    const rate = raw.trim() === "" ? null : Number(raw);
    if (rate !== null && (!Number.isFinite(rate) || rate <= 0)) return;
    const { error } = await supabaseBrowser().from("fin_trip_members").update({ cash_rate: rate }).eq("trip_id", trip.id).eq("user_id", m.user_id);
    if (error) return toast(error.message, "err");
    setMembers((ms) => (ms ?? []).map((x) => (x.user_id === m.user_id ? { ...x, cash_rate: rate } : x)));
    toast("Cash rate saved");
    await onChanged();
  }

  const available = people.filter((p) => !(members ?? []).some((m) => m.user_id === p.id));

  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-card-2 transition">
        <span className="size-10 rounded-xl bg-blue-soft text-blue grid place-items-center text-lg">🧳</span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2 font-semibold">
            {trip.code}
            {trip.status === "closed" && <Badge>Closed</Badge>}
          </span>
          <span className="block text-xs text-ink-3 truncate">
            {trip.name}
            {trip.destination ? ` · ${trip.destination}` : ""}
            {trip.budget_myr ? ` · ${fmtMYR(trip.budget_myr)}` : ""}
          </span>
        </span>
        <ChevronDown className={cn("size-4 text-ink-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 anim-rise border-t border-line/70 pt-4">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Code">
                <Input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} className="uppercase" />
              </Field>
              <Field label="Budget (MYR)">
                <Input type="number" inputMode="decimal" min={0} step="0.01" value={edit.budget_myr} onChange={(e) => setEdit({ ...edit, budget_myr: e.target.value })} placeholder="—" />
              </Field>
            </div>
            <Field label="Name">
              <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <Field label="Destination">
              <Input value={edit.destination} onChange={(e) => setEdit({ ...edit, destination: e.target.value })} placeholder="—" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start">
                <Input type="date" value={edit.start_date} onChange={(e) => setEdit({ ...edit, start_date: e.target.value })} />
              </Field>
              <Field label="End">
                <Input type="date" value={edit.end_date} onChange={(e) => setEdit({ ...edit, end_date: e.target.value })} />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => void toggleStatus()}>
                {trip.status === "active" ? "Close trip" : "Reopen trip"}
              </Button>
              <Button className="flex-1" loading={saving} onClick={() => void saveTrip()}>
                Save
              </Button>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-3 mb-2">Members {members ? `(${members.length})` : ""}</p>
            {members === null ? (
              <div className="grid place-items-center py-6">
                <Spinner />
              </div>
            ) : (
              <div className="rounded-2xl bg-card-2 overflow-hidden">
                {members.map((m) => (
                  <div key={m.user_id} className="flex items-center gap-3 px-3 py-2.5 border-b border-line/60 last:border-b-0">
                    <Avatar name={m.profile.name} color={m.profile.color} size={30} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">{m.profile.name}</span>
                      <span className="block text-[11px] text-ink-3">{m.profile.role}</span>
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.001"
                      min={0}
                      defaultValue={m.cash_rate ?? ""}
                      placeholder="rate"
                      aria-label={`Cash rate for ${m.profile.name}`}
                      onBlur={(e) => {
                        const v = e.target.value;
                        if ((v.trim() === "" ? null : Number(v)) !== m.cash_rate) void setRate(m, v);
                      }}
                      className="w-20 h-9 px-2 rounded-xl bg-card border border-line text-sm text-right tabular-nums outline-none focus:border-brand"
                    />
                    <button type="button" onClick={() => void removeMember(m)} className="size-9 grid place-items-center rounded-xl text-ink-3 hover:text-rose hover:bg-rose-soft transition" aria-label="Remove">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
                {members.length === 0 && <p className="text-sm text-ink-3 px-3 py-3">No members yet.</p>}
              </div>
            )}
            <p className="text-xs text-ink-3 mt-1.5">
              <span className="font-medium">Cash rate</span> (RMB per 1 MYR, e.g. 1.568) is for members who exchanged cash; their cash RMB expenses convert at this rate.
            </p>
            {available.length > 0 && (
              <div className="flex gap-2 mt-3">
                <Select value={addId} onChange={(e) => setAddId(e.target.value)} className="flex-1">
                  <option value="">Add a member…</option>
                  {available.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.role})
                    </option>
                  ))}
                </Select>
                <Button variant="soft" disabled={!addId} onClick={() => void addMember()}>
                  <Plus className="size-4" /> Add
                </Button>
              </div>
            )}
          </div>
          {!isAdmin && <p className="text-[11px] text-ink-3">Only admins can delete trips.</p>}
        </div>
      )}
    </Card>
  );
}
