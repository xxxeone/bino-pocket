"use client";

import { X } from "lucide-react";
import { useSyncExternalStore } from "react";

const KEY = "bino.installBannerDismissed";
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
function snapshot() {
  if (typeof window === "undefined") return "ssr";
  try {
    if (localStorage.getItem(KEY)) return "hidden";
  } catch {}
  if (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone) return "hidden";
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ? "ios" : /Android/.test(navigator.userAgent) ? "android" : "hidden";
}

/** One-time nudge to add the PWA to the home screen (hidden once installed or dismissed). */
export function InstallBanner() {
  const state = useSyncExternalStore(subscribe, snapshot, () => "ssr");
  if (state === "ssr" || state === "hidden") return null;
  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
    listeners.forEach((l) => l());
  };
  return (
    <div className="mb-4 rounded-2xl bg-brand-soft text-brand px-4 py-3 text-sm flex items-start gap-3 anim-rise">
      <div className="flex-1">
        <div className="font-semibold">Add Bino Pocket to your Home Screen</div>
        <div className="text-xs opacity-80 mt-0.5">
          {state === "ios" ? "Tap the Share button, then “Add to Home Screen”." : "Open the browser menu (⋮), then “Add to Home screen” / “Install app”."} Then screenshots can be shared straight into the scanner.
        </div>
      </div>
      <button type="button" onClick={dismiss} className="size-7 grid place-items-center rounded-full hover:bg-black/5" aria-label="Dismiss">
        <X className="size-4" />
      </button>
    </div>
  );
}
