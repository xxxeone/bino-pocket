"use client";

import { useEffect, useState } from "react";

const STEPS = ["Reading the screenshot…", "Finding the amounts…", "Matching Touch 'n Go…", "Working out the rate…", "Writing it up…"];

export function ScanningView({ thumb, count }: { thumb: string; count: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % STEPS.length), 1500);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="px-5 pt-6 flex flex-col items-center anim-rise">
      <div className="relative w-48 aspect-[3/4] rounded-3xl overflow-hidden shadow-card scanline bg-card-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumb} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-brand/30 to-transparent" />
        {count > 1 && (
          <span className="absolute top-2 right-2 text-xs font-bold bg-black/60 text-white rounded-full px-2 py-0.5">+{count - 1}</span>
        )}
      </div>
      <p className="mt-6 font-semibold text-lg" aria-live="polite">
        {STEPS[i]}
      </p>
      <p className="text-sm text-ink-3 mt-1">Usually 5–10 seconds</p>
    </div>
  );
}
