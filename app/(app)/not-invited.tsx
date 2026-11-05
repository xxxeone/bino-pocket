"use client";

import { Button } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function NotInvited({ email }: { email: string }) {
  const router = useRouter();
  return (
    <div className="min-h-dvh grid place-items-center p-6">
      <div className="text-center max-w-sm anim-rise">
        <div className="text-5xl mb-4">🚪</div>
        <h1 className="text-xl font-bold">Not on the list yet</h1>
        <p className="text-ink-2 mt-2 text-sm">
          <span className="font-medium">{email}</span> is signed in, but hasn&apos;t been added to Bino Pocket. Ask the admin to add you.
        </p>
        <Button
          variant="secondary"
          className="mt-6"
          onClick={async () => {
            await supabaseBrowser().auth.signOut();
            router.replace("/login");
          }}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
