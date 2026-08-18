import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import logoCream from "@/assets/logo-cream.jpg.asset.json";

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const height = { sm: "h-8", md: "h-11", lg: "h-20" }[size];
  return (
    <img
      src={logoCream.url}
      alt="BackRest — Sleep. Reset. Perform."
      className={cn("w-auto rounded-lg object-contain", height)}
    />
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
