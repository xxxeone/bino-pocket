"use client";

import { Button, Input, Label } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      setError("Wrong email or password.");
      return;
    }
    router.replace(params.get("next") || "/");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@bino.com" />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
      </div>
      {error && <p className="text-sm text-rose font-medium">{error}</p>}
      <Button type="submit" size="lg" className="w-full" loading={loading}>
        Sign in
      </Button>
      <p className="text-xs text-ink-3 text-center pt-2">Invite-only. Ask Jesson if you need access.</p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-dvh flex flex-col justify-center mx-auto w-full max-w-sm px-6 py-10">
      <div className="mb-8 anim-rise">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo.png" alt="Bino EduTour" width={132} height={59} className="h-14 w-auto" />
        <h1 className="text-3xl font-extrabold tracking-tight mt-6">Pocket</h1>
        <p className="text-ink-2 mt-1">Trip petty cash — scan it, submit it, done.</p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
