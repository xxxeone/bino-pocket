"use client";

import { useApp } from "@/components/providers";
import { Avatar, Badge, Button, Card, Empty, Field, Input, PageHeader, Select, Sheet, Spinner, useToast } from "@/components/ui";
import { MEMBER_COLORS } from "@/lib/constants";
import { listProfiles } from "@/lib/data";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Profile, Role } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import { useAsync } from "@/lib/use-async";
import { useEffect, useMemo, useState } from "react";

const ROLE_TONE: Record<Role, "neutral" | "blue" | "brand"> = { member: "neutral", lead: "blue", admin: "brand" };

export default function MembersPage() {
  const { isAdmin, profile: me } = useApp();
  const toast = useToast();
  const { data, loading, error, reload, setData } = useAsync(listProfiles, []);
  const people = useMemo(() => data ?? [], [data]);
  const setPeople = (fn: (ps: Profile[]) => Profile[]) => setData((d) => fn(d ?? []));
  const load = async () => reload();
  useEffect(() => {
    if (error) toast(error.message, "err");
  }, [error, toast]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "member" as Role });
  const [newPw, setNewPw] = useState("");
  const [saving, setSaving] = useState(false);

  async function addMember() {
    setSaving(true);
    const sb = supabaseBrowser();
    try {
      const { data: id, error } = await sb.rpc("fin_admin_create_user", {
        p_email: form.email.trim(),
        p_password: form.password,
        p_name: form.name.trim(),
        p_role: form.role,
      });
      if (error) throw error;
      const color = MEMBER_COLORS[people.length % MEMBER_COLORS.length];
      await sb.from("fin_profiles").update({ color }).eq("id", id as string);
      toast(`${form.name.trim()} added`);
      setAdding(false);
      setForm({ name: "", email: "", password: "", role: "member" });
      await load();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setSaving(false);
    }
  }

  async function patch(p: Profile, changes: Partial<Profile>) {
    const { error } = await supabaseBrowser().from("fin_profiles").update(changes).eq("id", p.id);
    if (error) return toast(error.message, "err");
    setPeople((ps) => ps.map((x) => (x.id === p.id ? { ...x, ...changes } : x)));
    setEditing((e) => (e && e.id === p.id ? { ...e, ...changes } : e));
    toast("Saved");
  }

  async function resetPassword(p: Profile) {
    setSaving(true);
    const { error } = await supabaseBrowser().rpc("fin_admin_set_password", { p_user: p.id, p_password: newPw });
    setSaving(false);
    if (error) return toast(error.message, "err");
    setNewPw("");
    toast("Password updated");
  }

  if (!isAdmin) {
    return (
      <main>
        <PageHeader title="Members" />
        <Empty emoji="🔒" title="Admins only" />
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
        title="Members"
        subtitle={`${people.length} people`}
        right={
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Add
          </Button>
        }
      />
      {loading ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : (
        <Card className="mx-4 overflow-hidden anim-rise">
          {people.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setEditing(p)}
              className={cn("w-full flex items-center gap-3 px-4 py-3 text-left border-b border-line/70 last:border-b-0 active:bg-card-2 transition", !p.active && "opacity-50")}
            >
              <Avatar name={p.name} color={p.color} />
              <span className="flex-1 min-w-0">
                <span className="block font-medium truncate">
                  {p.name} {p.id === me.id && <span className="text-ink-3 font-normal">(you)</span>}
                </span>
                <span className="block text-xs text-ink-3 truncate">{p.email}</span>
              </span>
              <Badge tone={ROLE_TONE[p.role]}>{p.role}</Badge>
              {!p.active && <Badge tone="rose">Off</Badge>}
            </button>
          ))}
        </Card>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add member">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void addMember();
          }}
        >
          <Field label="Name">
            <Input required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Eric" />
          </Field>
          <Field label="Email">
            <Input required type="email" inputMode="email" autoCapitalize="none" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="eric@bino.com" />
          </Field>
          <Field label="Password" hint="Min 6 characters. Share it with them; they can keep using it.">
            <Input required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="e.g. Bino2026" />
            <p className="text-xs text-ink-3 mt-1">If this email already has a Bino CRM login, their existing password is kept — tell them to use that.</p>
          </Field>
          <Field label="Role">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="member">Member — submits claims</option>
              <option value="lead">Lead — can approve</option>
              <option value="admin">Admin — everything</option>
            </Select>
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={saving}>
            Add member
          </Button>
        </form>
      </Sheet>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.name}>
        {editing && (
          <div className="space-y-4">
            <p className="text-sm text-ink-3 -mt-2">{editing.email}</p>
            <Field label="Role">
              <Select value={editing.role} disabled={editing.id === me.id} onChange={(e) => void patch(editing, { role: e.target.value as Role })}>
                <option value="member">Member</option>
                <option value="lead">Lead</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
            <Field label="Reset password" hint="Min 6 characters.">
              <div className="flex gap-2">
                <Input minLength={6} value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="New password" />
                <Button variant="secondary" disabled={newPw.length < 6} loading={saving} onClick={() => void resetPassword(editing)}>
                  Set
                </Button>
              </div>
            </Field>
            {editing.id !== me.id && (
              <Button
                variant={editing.active ? "danger" : "soft"}
                className={cn("w-full", editing.active && "bg-rose-soft text-rose")}
                onClick={() => void patch(editing, { active: !editing.active })}
              >
                {editing.active ? "Deactivate (can't sign in)" : "Reactivate"}
              </Button>
            )}
          </div>
        )}
      </Sheet>
    </main>
  );
}
