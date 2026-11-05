"use client";

import { useApp } from "@/components/providers";
import { Avatar, Badge, Button, Card, Field, Input, PageHeader, Select, useToast } from "@/components/ui";
import { setMyCashRate } from "@/lib/data";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { displayLogin } from "@/lib/username";
import { BarChart3, ChevronRight, LogOut, Monitor, Moon, Settings2, Share, Sun } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

function applyTheme(t: Theme) {
  try {
    if (t === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", t);
    const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  } catch {}
}

export default function MePage() {
  const { profile, trips, trip, setTripId, membership, refreshMembership, isAdmin, isReviewer } = useApp();
  const toast = useToast();
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>("system");
  const [rate, setRate] = useState("");
  const [name, setName] = useState(profile.name);

  async function saveName() {
    const n = name.trim();
    if (!n) return;
    const { error } = await supabaseBrowser().from("fin_profiles").update({ name: n }).eq("id", profile.id);
    if (error) return toast(error.message, "err");
    toast("Name saved");
    router.refresh();
  }
  const [isIOS, setIsIOS] = useState(false);
  const [standalone, setStandalone] = useState(true);

  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        setTheme((localStorage.getItem("theme") as Theme) || "system");
      } catch {}
      setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
      setStandalone(matchMedia("(display-mode: standalone)").matches);
    });
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => setRate(membership?.cash_rate?.toString() ?? ""));
  }, [membership?.cash_rate]);

  async function saveRate() {
    if (!trip) return;
    const v = rate.trim() === "" ? null : Number(rate);
    if (v !== null && (!Number.isFinite(v) || v <= 0)) return toast("Enter a rate like 1.568", "err");
    try {
      await setMyCashRate(trip.id, profile.id, v);
      await refreshMembership();
      toast("Cash rate saved");
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  return (
    <main>
      <PageHeader title="Me" />
      <div className="px-4 space-y-4 anim-rise">
        <Card className="flex items-center gap-4 p-4">
          <Avatar name={profile.name} color={profile.color} size={52} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-lg truncate">{profile.name}</p>
            <p className="text-sm text-ink-3 truncate">{displayLogin(profile.email)}</p>
          </div>
          <Badge tone={profile.role === "admin" ? "brand" : profile.role === "lead" ? "blue" : "neutral"}>{profile.role}</Badge>
        </Card>

        <Card className="p-4 space-y-4">
          <Field label="My name">
            <div className="flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
              <Button variant="secondary" onClick={() => void saveName()} disabled={!name.trim() || name.trim() === profile.name}>
                Save
              </Button>
            </div>
          </Field>
          <Field label="Current trip">
            <Select value={trip?.id ?? ""} onChange={(e) => setTripId(e.target.value)}>
              {trips.length === 0 && <option value="">No trips yet</option>}
              {trips.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} · {t.name}
                  {t.status === "closed" ? " (closed)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          {trip && (
            <Field label="My cash rate" hint="RMB per 1 MYR, e.g. 1.568 — only if you exchanged cash; your cash RMB expenses convert at this rate.">
              <div className="flex gap-2">
                <Input type="number" inputMode="decimal" step="0.001" min={0} value={rate} onChange={(e) => setRate(e.target.value)} placeholder="e.g. 1.568" />
                <Button variant="secondary" onClick={() => void saveRate()} disabled={(membership?.cash_rate?.toString() ?? "") === rate.trim()}>
                  Save
                </Button>
              </div>
            </Field>
          )}
        </Card>

        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-3 mb-2">Appearance</p>
          <div className="flex bg-card-2 rounded-2xl p-1">
            {(
              [
                ["light", "Light", Sun],
                ["dark", "Dark", Moon],
                ["system", "Auto", Monitor],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setTheme(id);
                  applyTheme(id);
                }}
                className={cn("flex-1 h-10 rounded-xl text-sm font-medium inline-flex items-center justify-center gap-1.5 transition", theme === id ? "bg-card shadow-card text-ink" : "text-ink-3")}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
        </Card>

        {!standalone && (
          <Card className="p-4 flex gap-3">
            <span className="size-10 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
              <Share className="size-5" />
            </span>
            <div className="text-sm">
              <p className="font-semibold">Install as an app</p>
              <p className="text-ink-2 mt-0.5">
                {isIOS ? (
                  <>
                    Tap <span className="font-medium">Share</span> → <span className="font-medium">Add to Home Screen</span>.
                  </>
                ) : (
                  <>
                    Open the browser menu → <span className="font-medium">Install app</span> / <span className="font-medium">Add to Home screen</span>.
                  </>
                )}
              </p>
            </div>
          </Card>
        )}

        {(isAdmin || isReviewer) && (
          <Card className="overflow-hidden">
            {isReviewer && (
              <Link href="/report" className="flex items-center gap-3 px-4 py-3 border-b border-line/70 last:border-b-0 active:bg-card-2 transition">
                <BarChart3 className="size-5 text-blue" />
                <span className="flex-1 font-medium">Trip report</span>
                <ChevronRight className="size-5 text-ink-3" />
              </Link>
            )}
            {isReviewer && (
              <Link href="/admin" className="flex items-center gap-3 px-4 py-3 border-b border-line/70 last:border-b-0 active:bg-card-2 transition">
                <Settings2 className="size-5 text-brand" />
                <span className="flex-1 font-medium">{isAdmin ? "Admin" : "Trips"}</span>
                <ChevronRight className="size-5 text-ink-3" />
              </Link>
            )}
          </Card>
        )}

        <Button
          variant="secondary"
          className="w-full"
          onClick={async () => {
            await supabaseBrowser().auth.signOut();
            router.replace("/login");
            router.refresh();
          }}
        >
          <LogOut className="size-4" /> Sign out
        </Button>
        <p className="text-center text-[11px] text-ink-3 pb-2">Bino Pocket</p>
      </div>
    </main>
  );
}
