"use client";

import { useApp } from "@/components/providers";
import { Badge, Button, Card, Empty, Field, Input, PageHeader, useToast } from "@/components/ui";
import { useAsync } from "@/lib/use-async";
import { ArrowLeft, Check, Cloud, Copy, ExternalLink, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, useSyncExternalStore } from "react";

interface Status {
  connected: boolean;
  hasClient: boolean;
  clientId: string | null;
  account: string | null;
  folderUrl: string | null;
}

export default function DrivePage() {
  return (
    <Suspense>
      <DriveSetup />
    </Suspense>
  );
}

function DriveSetup() {
  const { isAdmin, trip } = useApp();
  const toast = useToast();
  const params = useSearchParams();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { data: status, loading, reload } = useAsync(() => fetch("/api/drive/sync").then((r) => r.json() as Promise<Status>), []);
  // Read after hydration so server and client markup match.
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  const redirectUri = `${origin}/api/drive/callback`;
  const urlError = params.get("error");
  const justConnected = params.get("connected") === "1";

  if (!isAdmin) {
    return (
      <main>
        <PageHeader title="Google Drive" />
        <Empty emoji="🔒" title="Admins only" />
      </main>
    );
  }

  async function saveClient(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch("/api/drive/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, clientSecret }) });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || j.error) throw new Error(j.error ?? "Could not save");
      toast("Saved. Now tap Connect Google Drive.");
      setClientSecret("");
      reload();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setSaving(false);
    }
  }

  async function syncTrip() {
    if (!trip) return;
    setSyncing(true);
    try {
      const r = await fetch("/api/drive/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tripId: trip.id }) });
      const j = (await r.json()) as { synced?: number; remaining?: number; errors?: string[]; error?: string; skipped?: boolean };
      if (!r.ok || j.error) throw new Error(j.error ?? "Sync failed");
      if (j.skipped) throw new Error("Drive is not connected yet");
      toast(`Copied ${j.synced ?? 0} receipt${j.synced === 1 ? "" : "s"} to Drive${j.remaining ? ` · ${j.remaining} left, tap again` : ""}`);
      if (j.errors?.length) console.error(j.errors);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect Google Drive? Receipts already copied stay in Drive.")) return;
    await fetch("/api/drive/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ disconnect: true }) });
    reload();
  }

  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast("Copied"));
  const step = loading ? 0 : status?.connected ? 3 : status?.hasClient ? 2 : 1;

  return (
    <main className="pb-6">
      <div className="px-4 pt-4">
        <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-ink-3">
          <ArrowLeft className="size-4" /> Admin
        </Link>
      </div>
      <PageHeader title="Google Drive" subtitle="Receipts are copied to Drive: Bino Pocket / TRIP / Name /" />

      <div className="px-4 space-y-3">
        {justConnected && (
          <div className="rounded-2xl bg-green-soft text-green px-4 py-3 text-sm font-semibold anim-pop flex items-center gap-2">
            <Check className="size-4" /> Google Drive connected. New receipts will be copied automatically when approved.
          </div>
        )}
        {urlError && <div className="rounded-2xl bg-rose-soft text-rose px-4 py-3 text-sm font-medium anim-pop">Google said: {decodeURIComponent(urlError)}</div>}

        {/* Status */}
        <Card className="p-4 flex items-center gap-3">
          <span className={`size-11 rounded-2xl grid place-items-center ${status?.connected ? "bg-green-soft text-green" : "bg-card-2 text-ink-3"}`}>
            <Cloud className="size-5" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold flex items-center gap-2">
              Status {loading ? <Badge>…</Badge> : status?.connected ? <Badge tone="green">Connected</Badge> : <Badge tone="amber">Not connected</Badge>}
            </div>
            <div className="text-xs text-ink-3 truncate">{status?.account ? `Drive of ${status.account}` : status?.hasClient ? "Client saved — connect your Google account" : "3 short steps below"}</div>
          </div>
          {status?.folderUrl && (
            <a href={status.folderUrl} target="_blank" rel="noreferrer" className="text-brand" aria-label="Open folder">
              <ExternalLink className="size-5" />
            </a>
          )}
        </Card>

        {status?.connected ? (
          <Card className="p-4 space-y-3">
            <p className="text-sm text-ink-2">Receipts are copied when management approves a claim. Use this to copy anything older or anything that was missed.</p>
            <Button className="w-full" onClick={syncTrip} loading={syncing} disabled={!trip}>
              <RefreshCw className="size-4" /> Copy {trip?.code ?? "trip"} receipts now
            </Button>
            {status.folderUrl && (
              <a href={status.folderUrl} target="_blank" rel="noreferrer" className="block">
                <Button variant="secondary" className="w-full">
                  <ExternalLink className="size-4" /> Open the Drive folder
                </Button>
              </a>
            )}
            <button type="button" onClick={disconnect} className="w-full text-xs text-ink-3 underline underline-offset-4 pt-1">
              Disconnect
            </button>
          </Card>
        ) : (
          <>
            {/* Step 1 */}
            <Step n={1} title="Create a Google “key” for the app (one time, ~5 min)" active={step === 1} done={step > 1}>
              <ol className="list-decimal pl-5 space-y-2 text-sm text-ink-2">
                <li>
                  Open{" "}
                  <a className="text-brand font-semibold underline underline-offset-2" href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">
                    console.cloud.google.com → New project
                  </a>
                  , name it <b>Bino Pocket</b>, Create.
                </li>
                <li>
                  <a className="text-brand font-semibold underline underline-offset-2" href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noreferrer">
                    Enable the Google Drive API
                  </a>{" "}
                  (make sure the Bino Pocket project is selected at the top).
                </li>
                <li>
                  <a className="text-brand font-semibold underline underline-offset-2" href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noreferrer">
                    Google Auth Platform → Get started
                  </a>
                  : App name <b>Bino Pocket</b>, your email, audience <b>External</b>, Create. Then <b>Audience → Publish app</b>.
                </li>
                <li>
                  <a className="text-brand font-semibold underline underline-offset-2" href="https://console.cloud.google.com/auth/clients/create" target="_blank" rel="noreferrer">
                    Create an OAuth client
                  </a>
                  : type <b>Web application</b>, name <b>Bino Pocket</b>, and under <b>Authorised redirect URIs</b> paste:
                  <button type="button" onClick={() => copy(redirectUri)} className="mt-1.5 w-full flex items-center justify-between gap-2 rounded-xl bg-card-2 px-3 py-2 font-mono text-[12px] text-ink text-left break-all active:scale-[0.99]">
                    <span>{redirectUri}</span>
                    <Copy className="size-4 shrink-0 text-ink-3" />
                  </button>
                </li>
                <li>Click Create → Google shows a <b>Client ID</b> and <b>Client secret</b>. Paste both below.</li>
              </ol>
            </Step>

            {/* Step 2 */}
            <Step n={2} title="Paste the Client ID and secret" active={step <= 2} done={step > 2}>
              <form onSubmit={saveClient} className="space-y-3">
                <Field label="Client ID">
                  <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder={status?.clientId ?? "1234567890-abc.apps.googleusercontent.com"} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                </Field>
                <Field label="Client secret">
                  <Input value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={status?.hasClient ? "•••••••• (saved)" : "GOCSPX-…"} type="password" autoCapitalize="none" />
                </Field>
                <Button type="submit" className="w-full" loading={saving} disabled={!clientId || !clientSecret}>
                  Save
                </Button>
              </form>
            </Step>

            {/* Step 3 */}
            <Step n={3} title="Connect your Google account" active={step === 2} done={false}>
              <p className="text-sm text-ink-2 mb-3">Sign in with the Google account whose Drive should hold the receipts. Google may show an “unverified app” notice — tap <b>Continue</b>; the app can only touch the folder it creates.</p>
              <a href="/api/drive/auth" className={step < 2 ? "pointer-events-none opacity-50 block" : "block"}>
                <Button className="w-full">
                  <Cloud className="size-4" /> Connect Google Drive
                </Button>
              </a>
            </Step>
          </>
        )}
      </div>
    </main>
  );
}

function Step({ n, title, active, done, children }: { n: number; title: string; active: boolean; done: boolean; children: React.ReactNode }) {
  return (
    <Card className={`p-4 ${active ? "" : "opacity-80"}`}>
      <div className="flex items-center gap-3 mb-3">
        <span className={`size-7 rounded-full grid place-items-center text-sm font-bold ${done ? "bg-green-soft text-green" : active ? "bg-brand text-brand-ink" : "bg-card-2 text-ink-3"}`}>
          {done ? <Check className="size-4" /> : n}
        </span>
        <h2 className="font-semibold leading-tight">{title}</h2>
      </div>
      {children}
    </Card>
  );
}
