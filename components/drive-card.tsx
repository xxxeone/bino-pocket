"use client";

import { Badge, Card } from "@/components/ui";
import { useAsync } from "@/lib/use-async";
import { ChevronRight, Cloud, CloudOff } from "lucide-react";
import Link from "next/link";

/** Admin hub card: Google Drive archive status → opens the setup page. */
export function DriveCard() {
  const { data, loading } = useAsync(
    () => fetch("/api/drive/sync").then((r) => r.json() as Promise<{ connected: boolean; account: string | null }>),
    [],
  );
  const connected = data?.connected ?? false;
  return (
    <Link href="/admin/drive">
      <Card className="flex items-center gap-4 p-4 mt-3 active:bg-card-2 transition">
        <span className={`size-11 rounded-2xl grid place-items-center ${connected ? "bg-green-soft text-green" : "bg-card-2 text-ink-3"}`}>
          {connected ? <Cloud className="size-5" /> : <CloudOff className="size-5" />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2 font-semibold">
            Google Drive archive {loading ? null : connected ? <Badge tone="green">Connected</Badge> : <Badge tone="amber">Set up</Badge>}
          </span>
          <span className="block text-sm text-ink-3 truncate">{connected ? `Receipts copy to ${data?.account ?? "Drive"}` : "Copy every receipt to a Drive folder per trip & person"}</span>
        </span>
        <ChevronRight className="size-5 text-ink-3" />
      </Card>
    </Link>
  );
}
