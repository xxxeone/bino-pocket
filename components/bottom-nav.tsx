"use client";

import { useApp } from "@/components/providers";
import { cn } from "@/lib/utils";
import { BarChart3, CheckCheck, Home, ReceiptText, ScanLine, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function BottomNav() {
  const { isReviewer } = useApp();
  const path = usePathname();
  const tabs = isReviewer
    ? [
        { href: "/", label: "Home", Icon: Home },
        { href: "/claims", label: "Claims", Icon: ReceiptText },
        { href: "/scan", label: "Scan", Icon: ScanLine, fab: true },
        { href: "/review", label: "Review", Icon: CheckCheck },
        { href: "/report", label: "Report", Icon: BarChart3 },
      ]
    : [
        { href: "/", label: "Home", Icon: Home },
        { href: "/claims", label: "Claims", Icon: ReceiptText },
        { href: "/scan", label: "Scan", Icon: ScanLine, fab: true },
        { href: "/me", label: "Me", Icon: UserRound },
      ];
  if (path.startsWith("/scan")) return null;
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 pointer-events-none">
      <div className="mx-auto max-w-lg pointer-events-auto bg-card/90 backdrop-blur-xl border-t border-line/70 pb-safe">
        <div className="flex items-stretch justify-around h-16">
          {tabs.map(({ href, label, Icon, fab }) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            if (fab)
              return (
                <Link key={href} href={href} className="relative -mt-5 flex flex-col items-center justify-start px-3" aria-label="Scan receipt">
                  <span className="size-14 rounded-full bg-brand text-brand-ink grid place-items-center shadow-[0_8px_24px_-6px_var(--brand)] active:scale-95 transition">
                    <Icon className="size-7" />
                  </span>
                  <span className="text-[11px] font-medium text-brand mt-1">{label}</span>
                </Link>
              );
            return (
              <Link
                key={href}
                href={href}
                className={cn("flex flex-col items-center justify-center gap-0.5 px-3 text-[11px] font-medium transition", active ? "text-brand" : "text-ink-3")}
              >
                <Icon className={cn("size-6", active && "fill-brand/15")} />
                {label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
