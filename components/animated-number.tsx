"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Eases a number from its previous value to the new one (≈650 ms, ease-out),
 * so totals "roll" instead of jumping. Respects prefers-reduced-motion.
 */
export function AnimatedNumber({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    const to = value;
    if (reduce || from === to) {
      fromRef.current = to;
      setShown(to);
      return;
    }
    const start = performance.now();
    const dur = 650;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (to - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = to;
    };
  }, [value]);

  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {format(shown)}
    </span>
  );
}
