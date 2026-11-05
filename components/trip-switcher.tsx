"use client";

import { useApp } from "@/components/providers";
import { Sheet } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";

/** Small trip label that opens a picker when the user is in more than one trip. */
export function TripSwitcher() {
  const { trip, trips, setTripId } = useApp();
  const [open, setOpen] = useState(false);
  if (!trip) return <span className="text-xs font-semibold text-ink-3">No trip</span>;
  const many = trips.length > 1;
  return (
    <>
      <button
        type="button"
        onClick={() => many && setOpen(true)}
        className={cn("inline-flex items-center gap-1 text-xs font-semibold text-ink-3 rounded-full", many && "active:opacity-70")}
      >
        {trip.code}
        {trip.destination && <span className="font-medium">· {trip.destination}</span>}
        {many && <ChevronDown className="size-3.5" />}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Switch trip">
        <div className="space-y-1">
          {trips.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTripId(t.id);
                setOpen(false);
              }}
              className="w-full flex items-center justify-between px-3 py-3 rounded-2xl hover:bg-card-2 text-left"
            >
              <div>
                <div className="font-semibold">
                  {t.code} <span className="text-ink-2 font-medium">· {t.name}</span>
                </div>
                <div className="text-xs text-ink-3">
                  {t.destination ?? ""} {t.status === "closed" && "· closed"}
                </div>
              </div>
              {t.id === trip.id && <Check className="size-5 text-brand" />}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
