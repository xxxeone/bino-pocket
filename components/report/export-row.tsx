"use client";

import { Button, useToast } from "@/components/ui";
import { CalendarCheck, Copy, FileSpreadsheet, Share2 } from "lucide-react";

export function ExportRow({
  tripId,
  summaryText,
  dailyText,
  mineOnly,
}: {
  tripId: string;
  summaryText: string;
  dailyText: string;
  mineOnly?: boolean;
}) {
  const toast = useToast();
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied — paste into WhatsApp`);
    } catch {
      toast("Could not copy", "err");
    }
  }
  async function share(text: string) {
    try {
      await navigator.share({ text });
    } catch {
      /* user cancelled */
    }
  }

  const href = `/api/export?trip=${tripId}${mineOnly ? "&me=1" : ""}`;
  return (
    <section className="mt-5 mb-2">
      <h2 className="px-1 text-sm font-bold text-ink-2 mb-2">Export</h2>
      <div className="grid grid-cols-2 gap-2">
        <a href={href} download className="col-span-2">
          <Button variant="primary" size="lg" className="w-full">
            <FileSpreadsheet className="size-5" />
            {mineOnly ? "Download my Excel sheet" : "Download Excel"}
          </Button>
        </a>
        <Button variant="secondary" onClick={() => copy(summaryText, "Summary")}>
          <Copy className="size-4" /> WhatsApp summary
        </Button>
        <Button variant="secondary" onClick={() => copy(dailyText, "Today's summary")}>
          <CalendarCheck className="size-4" /> Today&apos;s summary
        </Button>
        {canShare && (
          <Button variant="ghost" className="col-span-2" onClick={() => share(summaryText)}>
            <Share2 className="size-4" /> Share summary…
          </Button>
        )}
      </div>
    </section>
  );
}
