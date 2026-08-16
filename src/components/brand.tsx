import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { THEMES, useTheme } from "@/lib/theme";

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const scale = { sm: "text-lg", md: "text-2xl", lg: "text-4xl" }[size];
  return (
    <div className="inline-flex items-center gap-2">
      <span
        className={cn(
          "grid place-items-center rounded-xl brand-gradient text-primary-foreground font-display font-bold",
          size === "lg" ? "h-12 w-12 text-2xl" : size === "md" ? "h-9 w-9 text-lg" : "h-7 w-7 text-sm",
        )}
        aria-hidden
      >
        B
      </span>
      <span className={cn("font-display font-bold tracking-tight leading-none", scale)}>
        Back<span className="text-brand-gradient">Rest</span>
      </span>
    </div>
  );
}

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Change theme"
        className="press flex h-11 items-center gap-2 rounded-full border border-border bg-card px-3 text-sm font-semibold"
      >
        <span className="flex -space-x-1">
          {THEMES.find((t) => t.key === theme)!.swatch.slice(0, 3).map((c) => (
            <span
              key={c}
              className="h-4 w-4 rounded-full border border-border"
              style={{ backgroundColor: c }}
            />
          ))}
        </span>
        Theme
      </button>
      {open && (
        <div className="animate-pop absolute right-0 z-50 mt-2 w-60 rounded-2xl border border-border bg-popover p-2 shadow-lift">
          {THEMES.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTheme(t.key);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left",
                theme === t.key ? "bg-secondary" : "hover:bg-secondary/60",
              )}
            >
              <span className="flex -space-x-1">
                {t.swatch.map((c) => (
                  <span
                    key={c}
                    className="h-5 w-5 rounded-full border border-border"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </span>
              <span>
                <span className="block text-sm font-semibold">{t.name}</span>
                <span className="block text-xs text-muted-foreground">{t.note}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CountUp({ value, className }: { value: number; className?: string }) {
  const [n, setN] = useState(0);
  const raf = useRef<number | undefined>(undefined);
  useEffect(() => {
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 900);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current!);
  }, [value]);
  return <span className={className}>{n.toLocaleString("en-IN")}</span>;
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setW(value), 120);
    return () => clearTimeout(id);
  }, [value]);
  return (
    <div className={cn("h-3 w-full overflow-hidden rounded-full bg-secondary", className)}>
      <div
        className="h-full rounded-full brand-gradient shimmer-line transition-[width] duration-1000 ease-out"
        style={{ width: `${w}%` }}
      />
    </div>
  );
}

export function ProgressRing({ value, label, sub }: { value: number; label: string; sub?: string }) {
  const [p, setP] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setP(value), 150);
    return () => clearTimeout(id);
  }, [value]);
  const r = 78;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid h-52 w-52 place-items-center">
      <svg viewBox="0 0 180 180" className="h-52 w-52 -rotate-90">
        <circle cx="90" cy="90" r={r} className="fill-none stroke-secondary" strokeWidth="12" />
        <circle
          cx="90"
          cy="90"
          r={r}
          className="fill-none stroke-primary transition-[stroke-dashoffset] duration-1000 ease-out"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * p) / 100}
        />
      </svg>
      <div className="absolute text-center">
        <div className="font-display text-4xl font-bold">{label}</div>
        {sub && <div className="mt-1 text-sm text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}

export function Confetti() {
  const bits = Array.from({ length: 26 }, (_, i) => i);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {bits.map((i) => (
        <span
          key={i}
          className="absolute top-0 h-2 w-2 rounded-[2px] brand-gradient"
          style={{
            left: `${(i * 37) % 100}%`,
            ["--dx" as string]: `${((i % 7) - 3) * 26}px`,
            animation: `confetti-fall ${1.4 + (i % 5) * 0.25}s ease-in ${(i % 8) * 0.08}s forwards`,
          }}
        />
      ))}
    </div>
  );
}
