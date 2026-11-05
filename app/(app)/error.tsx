"use client";

import { Button } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-[70dvh] grid place-items-center px-6">
      <div className="text-center max-w-sm anim-rise">
        <div className="text-5xl mb-4">😵‍💫</div>
        <h1 className="text-xl font-bold">Something went wrong</h1>
        <p className="text-sm text-ink-3 mt-2 break-words">{error.message || "Please try again."}</p>
        <div className="flex gap-2 justify-center mt-6">
          <Button variant="secondary" onClick={() => (window.location.href = "/")}>
            Home
          </Button>
          <Button onClick={reset}>Try again</Button>
        </div>
      </div>
    </main>
  );
}
