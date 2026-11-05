"use client";

import { useEffect, useState } from "react";

const STEPS = ["Reading the screenshot", "Finding the amounts", "Matching Touch 'n Go", "Working out the rate", "Writing it up"];

/** Scanning screen: the screenshot in a glowing frame, a sweeping scan bar, and the step that is running. */
export function ScanningView({ thumb, count }: { thumb: string; count: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, STEPS.length - 1)), 1600);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="px-5 pt-8 flex flex-col items-center anim-rise">
      <div className="relative">
        <div className="absolute -inset-3 rounded-[2rem] bg-brand/15 anim-breathe" aria-hidden />
        <div className="relative w-52 aspect-[3/4] rounded-3xl overflow-hidden shadow-card scanline bg-card-2 ring-1 ring-brand/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumb} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-brand/35 via-transparent to-transparent" />
          <div className="absolute inset-x-0 top-0 h-1/2 anim-sweep" aria-hidden />
          {count > 1 && <span className="absolute top-2 right-2 text-xs font-bold bg-black/60 text-white rounded-full px-2 py-0.5">+{count - 1}</span>}
        </div>
      </div>

      <div className="mt-8 h-7 overflow-hidden text-center" aria-live="polite">
        <p key={i} className="font-semibold text-lg anim-rise">
          {STEPS[i]}
          <span className="inline-flex ml-1 align-baseline gap-0.5">
            <span className="dot !size-1.5" />
            <span className="dot !size-1.5" style={{ animationDelay: "120ms" }} />
            <span className="dot !size-1.5" style={{ animationDelay: "240ms" }} />
          </span>
        </p>
      </div>
      <div className="flex gap-1.5 mt-3" aria-hidden>
        {STEPS.map((_, k) => (
          <span key={k} className={`h-1.5 rounded-full transition-all duration-500 ${k <= i ? "w-5 bg-brand" : "w-1.5 bg-line"}`} />
        ))}
      </div>
      <p className="text-sm text-ink-3 mt-4">Usually 5–10 seconds · reads it twice</p>
    </div>
  );
}
