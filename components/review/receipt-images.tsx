"use client";

import { Sheet } from "@/components/ui";
import { receiptUrl } from "@/lib/data";
import type { ClaimImage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

/** Thumbnails of a claim's receipts; tap to view full-size. */
export function ReceiptImages({ images, size = 72, className }: { images: ClaimImage[]; size?: number; className?: string }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        images.map(async (img) => [img.id, await receiptUrl(img.storage_path).catch(() => "")] as const),
      );
      if (!cancelled) setUrls(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [images]);

  if (!images.length) return <p className={cn("text-xs text-ink-3", className)}>No receipt attached</p>;

  return (
    <>
      <div className={cn("flex gap-2 overflow-x-auto", className)}>
        {images.map((img) => {
          const url = urls[img.id];
          return (
            <button
              key={img.id}
              type="button"
              onClick={() => url && setOpen(url)}
              className="shrink-0 rounded-xl overflow-hidden bg-card-2 border border-line active:scale-95 transition"
              style={{ width: size, height: size }}
              aria-label="View receipt"
            >
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full skeleton" />
              )}
            </button>
          );
        })}
      </div>
      <Sheet open={!!open} onClose={() => setOpen(null)} title="Receipt">
        {open && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={open} alt="Receipt" className="w-full rounded-2xl" />
        )}
      </Sheet>
    </>
  );
}
