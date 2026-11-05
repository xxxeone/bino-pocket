"use client";

import { DriveCard } from "@/components/drive-card";
import { useApp } from "@/components/providers";
import { Card, Empty, PageHeader } from "@/components/ui";
import { ChevronRight, Luggage, Users } from "lucide-react";
import Link from "next/link";

export default function AdminPage() {
  const { isAdmin, isReviewer } = useApp();
  if (!isReviewer) {
    return (
      <main>
        <PageHeader title="Admin" />
        <Empty emoji="🔒" title="Admins only" />
      </main>
    );
  }
  return (
    <main>
      <PageHeader title="Admin" subtitle="People, trips, integrations" />
      <div className="px-4 space-y-3 anim-rise">
        {isAdmin && (
          <Link href="/admin/members">
            <Card className="flex items-center gap-4 p-4 active:bg-card-2 transition">
              <span className="size-11 rounded-2xl bg-brand-soft text-brand grid place-items-center">
                <Users className="size-5" />
              </span>
              <span className="flex-1">
                <span className="block font-semibold">Members</span>
                <span className="block text-sm text-ink-3">Add people, roles, passwords</span>
              </span>
              <ChevronRight className="size-5 text-ink-3" />
            </Card>
          </Link>
        )}
        <Link href="/admin/trips">
          <Card className="flex items-center gap-4 p-4 active:bg-card-2 transition mt-3">
            <span className="size-11 rounded-2xl bg-blue-soft text-blue grid place-items-center">
              <Luggage className="size-5" />
            </span>
            <span className="flex-1">
              <span className="block font-semibold">Trips</span>
              <span className="block text-sm text-ink-3">Create trips, members, budgets, cash rates</span>
            </span>
            <ChevronRight className="size-5 text-ink-3" />
          </Card>
        </Link>
        <DriveCard />
      </div>
    </main>
  );
}
