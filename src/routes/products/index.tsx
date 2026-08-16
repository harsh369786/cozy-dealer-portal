import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import { inr, products } from "@/lib/demo-data";

export const Route = createFileRoute("/products/")({
  head: () => ({
    meta: [
      { title: "Products — BackRest Dealer App" },
      { name: "description", content: "Browse BackRest mattresses, pillows and cushions with dealer prices." },
      { property: "og:title", content: "Products — BackRest Dealer App" },
      { property: "og:description", content: "Mattresses, pillows and cushions with dealer prices and reward points." },
    ],
  }),
  component: Catalogue,
});

const categories = ["All", "Mattresses", "Pillows", "Cushions"] as const;

function Catalogue() {
  const [cat, setCat] = useState<(typeof categories)[number]>("All");
  const [q, setQ] = useState("");

  const list = products.filter(
    (p) =>
      (cat === "All" || p.category === cat) && p.name.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <AppShell title="Products">
      <div className="flex items-center gap-2 rounded-2xl border border-input bg-card px-4">
        <Search className="h-5 w-5 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="What are you looking for?"
          className="h-14 w-full bg-transparent text-base outline-none"
        />
      </div>

      <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={cn(
              "press shrink-0 rounded-full border px-5 py-2.5 text-sm font-bold",
              cat === c
                ? "border-transparent brand-gradient text-primary-foreground"
                : "border-border bg-card text-foreground",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-4">
        {list.map((p, i) => (
          <div
            key={p.id}
            className="animate-rise overflow-hidden rounded-3xl border border-border bg-card shadow-soft"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <img src={p.image} alt={p.name} loading="lazy" width={800} height={800} className="h-44 w-full object-cover" />
            <div className="p-4">
              <p className="font-display text-lg font-bold">{p.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{p.blurb}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {p.sizes.map((s) => (
                  <span key={s} className="rounded-lg bg-secondary px-2.5 py-1 text-xs font-semibold">
                    {s}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Dealer price</p>
                  <p className="font-display text-xl font-bold">{inr(p.price)}</p>
                </div>
                <p className="text-sm font-bold text-primary">Earn {p.points} points 🎁</p>
              </div>
              <Link
                to="/products/$productId"
                params={{ productId: p.id }}
                className="press mt-4 block rounded-2xl brand-gradient py-3.5 text-center text-base font-bold text-primary-foreground"
              >
                View Details
              </Link>
            </div>
          </div>
        ))}
        {list.length === 0 && (
          <p className="py-16 text-center text-muted-foreground">No products found.</p>
        )}
      </div>
    </AppShell>
  );
}
