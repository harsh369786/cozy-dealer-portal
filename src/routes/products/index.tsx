import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck, Gift } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import { inr, pillows, products, type Product } from "@/lib/demo-data";

export const Route = createFileRoute("/products/")({
  head: () => ({
    meta: [
      { title: "Choose a Model — BackRest Dealer App" },
      {
        name: "description",
        content: "Tap a mattress or pillow model to start an order — guarantee, thickness, dealer price and reward points on every card.",
      },
      { property: "og:title", content: "Choose a Model — BackRest Dealer App" },
      { property: "og:description", content: "Quick tap ordering for BackRest mattresses and pillows." },
    ],
  }),
  component: Catalogue,
});

const tabs = ["Mattresses", "Foldable", "Pillows"] as const;

function Catalogue() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Mattresses");

  const list = tab === "Pillows" ? pillows : products.filter((p) => p.category === tab);

  const groups = Array.from(new Set(list.map((p) => p.guarantee))).map((g) => ({
    guarantee: g,
    items: list.filter((p) => p.guarantee === g),
  }));

  return (
    <AppShell title="Choose a Model">
      <p className="text-sm text-muted-foreground">
        Tap any model to start your order. No searching needed.
      </p>

      <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1">
        {tabs.map((c) => (
          <button
            key={c}
            onClick={() => setTab(c)}
            className={cn(
              "press shrink-0 rounded-full border px-5 py-2.5 text-sm font-bold",
              tab === c
                ? "border-transparent brand-gradient text-primary-foreground"
                : "border-border bg-card text-foreground",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {groups.map((g) => (
        <section key={g.guarantee} className="mt-6">
          <h2 className="mb-3 flex items-center gap-2 font-display text-base font-bold">
            <ShieldCheck className="h-4 w-4 text-primary" />
            {g.guarantee === "Pillow" || g.guarantee === "Foldable"
              ? g.guarantee
              : `${g.guarantee} Guarantee`}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {g.items.map((p, i) => (
              <ModelCard key={p.id} product={p} delay={i * 50} />
            ))}
          </div>
        </section>
      ))}
    </AppShell>
  );
}

function ModelCard({ product: p, delay }: { product: Product; delay: number }) {
  return (
    <Link
      to="/products/$productId"
      params={{ productId: p.id }}
      style={{ animationDelay: `${delay}ms` }}
      className="press animate-rise flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-soft"
    >
      <div className="relative">
        <img
          src={p.image}
          alt={p.name}
          loading="lazy"
          width={800}
          height={800}
          className="h-24 w-full object-cover"
        />
        <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-bold">
          {p.guarantee === "Pillow" ? "Pillow" : p.guarantee}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-3">
        <p className="font-display text-sm font-bold leading-tight">{p.name}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {p.thicknesses.length ? p.thicknesses.join(" · ") : p.fixedSize}
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground line-through">MRP {inr(p.mrp)}</p>
        <p className="font-display text-lg font-bold text-primary">{inr(p.price)}</p>
        <p className="text-[11px] font-semibold">Earn {p.points} points</p>
        {p.free && (
          <p className="mt-2 flex items-center gap-1 rounded-lg bg-secondary px-2 py-1 text-[10px] font-bold">
            <Gift className="h-3 w-3 text-primary" /> FREE {p.free}
          </p>
        )}
        <span className="press mt-3 block rounded-xl brand-gradient py-2 text-center text-xs font-bold text-primary-foreground">
          Select
        </span>
      </div>
    </Link>
  );
}
