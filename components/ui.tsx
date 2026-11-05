"use client";

import { cn, initials } from "@/lib/utils";
import { Loader2, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useId, useState, type ReactNode } from "react";

/* ---------- Button ---------- */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";
type Size = "sm" | "md" | "lg";
export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  const v: Record<Variant, string> = {
    primary: "bg-brand text-brand-ink shadow-sm hover:brightness-105 active:brightness-95",
    secondary: "bg-card text-ink border border-line hover:bg-card-2",
    ghost: "bg-transparent text-ink-2 hover:bg-card-2",
    danger: "bg-rose text-white hover:brightness-105",
    soft: "bg-brand-soft text-brand hover:brightness-95",
  };
  const s: Record<Size, string> = {
    sm: "h-9 px-3 text-sm rounded-xl gap-1.5",
    md: "h-11 px-4 text-[15px] rounded-2xl gap-2",
    lg: "h-13 px-5 text-base rounded-2xl gap-2 font-semibold",
  };
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-medium transition active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 select-none",
        v[variant],
        s[size],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

/* ---------- Card ---------- */
export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("bg-card rounded-2xl shadow-card border border-line/60", className)} {...rest}>
      {children}
    </div>
  );
}

/* ---------- Inputs ---------- */
export function Label({ className, ...rest }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("block text-xs font-semibold uppercase tracking-wide text-ink-3 mb-1.5", className)} {...rest} />;
}
export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full h-12 px-4 rounded-2xl bg-card-2 border border-transparent text-ink text-[16px] placeholder:text-ink-3 outline-none focus:border-brand focus:bg-card transition",
        className,
      )}
      {...rest}
    />
  );
}
export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full min-h-20 p-4 rounded-2xl bg-card-2 border border-transparent text-ink text-[16px] placeholder:text-ink-3 outline-none focus:border-brand focus:bg-card transition resize-none",
        className,
      )}
      {...rest}
    />
  );
}
export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full h-12 px-4 rounded-2xl bg-card-2 border border-transparent text-ink text-[16px] outline-none focus:border-brand focus:bg-card transition appearance-none",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-ink-3 mt-1">{hint}</p>}
    </div>
  );
}

/* ---------- Chips (single select) ---------- */
export function Chips<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { id: T; label: string; emoji?: string }[];
  value: T | null | undefined;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            type="button"
            key={o.id}
            onClick={() => onChange(o.id)}
            className={cn(
              "h-9 px-3 rounded-full text-sm font-medium border transition active:scale-95",
              active ? "bg-brand text-brand-ink border-brand" : "bg-card text-ink-2 border-line hover:bg-card-2",
            )}
          >
            {o.emoji && <span className="mr-1">{o.emoji}</span>}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Badge ---------- */
export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: "neutral" | "amber" | "green" | "rose" | "blue" | "brand";
  className?: string;
  children: ReactNode;
}) {
  const t = {
    neutral: "bg-card-2 text-ink-2",
    amber: "bg-amber-soft text-amber",
    green: "bg-green-soft text-green",
    rose: "bg-rose-soft text-rose",
    blue: "bg-blue-soft text-blue",
    brand: "bg-brand-soft text-brand",
  }[tone];
  return <span className={cn("inline-flex items-center gap-1 h-6 px-2 rounded-full text-xs font-semibold", t, className)}>{children}</span>;
}
export function StatusBadge({ status }: { status: "pending" | "approved" | "rejected" }) {
  const map = { pending: ["amber", "Pending"], approved: ["green", "Approved"], rejected: ["rose", "Rejected"] } as const;
  const [tone, label] = map[status];
  return <Badge tone={tone}>{label}</Badge>;
}

/* ---------- Avatar ---------- */
export function Avatar({ name, color, size = 36, className }: { name: string; color: string; size?: number; className?: string }) {
  return (
    <div
      className={cn("rounded-full grid place-items-center text-white font-bold shrink-0", className)}
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}

/* ---------- Spinner / Empty ---------- */
/** Three Bino-blue dots. */
export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <div className={cn("inline-flex flex-col items-center gap-3", className)} role="status" aria-label={label ?? "Loading"}>
      <div className="flex items-center gap-1.5">
        <span className="dot" />
        <span className="dot" style={{ animationDelay: "120ms" }} />
        <span className="dot" style={{ animationDelay: "240ms" }} />
      </div>
      {label && <span className="text-sm text-ink-3">{label}</span>}
    </div>
  );
}
export function Empty({ emoji = "🗒️", title, hint, action }: { emoji?: string; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="text-center py-12 px-6 anim-rise">
      <div className="text-4xl mb-3">{emoji}</div>
      <p className="font-semibold text-ink">{title}</p>
      {hint && <p className="text-sm text-ink-3 mt-1">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------- Bottom sheet ---------- */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-lg bg-card rounded-t-3xl shadow-card anim-rise max-h-[92dvh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="mx-auto absolute left-1/2 -translate-x-1/2 top-2 h-1 w-10 rounded-full bg-line" />
          <h3 className="font-semibold text-lg mt-2">{title}</h3>
          <button onClick={onClose} className="size-9 grid place-items-center rounded-full hover:bg-card-2 mt-2" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="px-5 pb-6 pb-safe overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

/* ---------- Toast ---------- */
type Toast = { id: number; text: string; tone: "ok" | "err" };
const ToastCtx = createContext<(text: string, tone?: "ok" | "err") => void>(() => {});
export function useToast() {
  return useContext(ToastCtx);
}
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, text, tone }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx value={push}>
      {children}
      <div className="fixed top-3 inset-x-0 z-[60] flex flex-col items-center gap-2 pointer-events-none pt-safe">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "anim-pop px-4 py-2.5 rounded-2xl shadow-card text-sm font-medium max-w-[90vw]",
              t.tone === "ok" ? "bg-ink text-bg" : "bg-rose text-white",
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx>
  );
}

/* ---------- Page header ---------- */
export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between px-5 pt-5 pb-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-ink-3 mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

/* ---------- Money text ---------- */
export function Money({ myr, rmb, className }: { myr: string; rmb?: string; className?: string }) {
  return (
    <div className={cn("text-right", className)}>
      <div className="font-semibold tabular-nums">{myr}</div>
      {rmb && <div className="text-xs text-ink-3 tabular-nums">{rmb}</div>}
    </div>
  );
}
