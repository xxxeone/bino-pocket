"use client";

/**
 * Offline outbox: claims that failed to send because of a network error are
 * parked in IndexedDB and retried when the device is back online.
 */
import { useToast } from "@/components/ui";
import { addClaimImages, insertClaim, uploadReceipt, type NewClaim } from "@/lib/data";
import { del, get, set } from "idb-keyval";
import { useEffect } from "react";

const KEY = "bino.outbox";

export interface OutboxItem {
  id: string;
  createdAt: number;
  claim: NewClaim;
  images: string[]; // data URLs
}

export async function readOutbox(): Promise<OutboxItem[]> {
  return (await get<OutboxItem[]>(KEY)) ?? [];
}

export async function enqueueOutbox(item: Omit<OutboxItem, "id" | "createdAt">): Promise<void> {
  const list = await readOutbox();
  list.push({ ...item, id: crypto.randomUUID(), createdAt: Date.now() });
  await set(KEY, list);
}

export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  return /failed to fetch|network|load failed|fetch failed|ERR_INTERNET|ECONN|timeout/i.test(msg);
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const r = await fetch(dataUrl);
  return r.blob();
}

/** Try to send everything in the outbox. Returns how many were sent. */
export async function flushOutbox(): Promise<number> {
  const list = await readOutbox();
  if (!list.length) return 0;
  let sent = 0;
  const remaining: OutboxItem[] = [];
  for (const item of list) {
    try {
      const paths: string[] = [];
      for (const d of item.images) {
        const blob = await dataUrlToBlob(d);
        paths.push(await uploadReceipt(item.claim.trip_id, item.claim.user_id, blob));
      }
      const claim = await insertClaim(item.claim);
      await addClaimImages(claim.id, item.claim.user_id, paths);
      sent++;
    } catch (e) {
      if (isNetworkError(e)) remaining.push(item);
      else {
        // Permanent failure (e.g. RLS): keep it so the user doesn't lose it, but stop retrying this run.
        remaining.push(item);
        console.error("outbox item failed", e);
      }
    }
  }
  if (remaining.length) await set(KEY, remaining);
  else await del(KEY);
  return sent;
}

/** Mount once (home page). Retries the outbox on mount and whenever the device comes online. */
export function OutboxSync() {
  const toast = useToast();
  useEffect(() => {
    let busy = false;
    const run = async () => {
      if (busy) return;
      busy = true;
      try {
        const n = await flushOutbox();
        if (n > 0) toast(`Sent ${n} saved claim${n > 1 ? "s" : ""} 🎉`);
      } catch {
        /* ignore */
      } finally {
        busy = false;
      }
    };
    void run();
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, [toast]);
  return null;
}
