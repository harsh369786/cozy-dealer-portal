import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import { pillows, products, MATTRESS_LAYERS, type Product } from "@/lib/demo-data";

export const Route = createFileRoute("/products/")({
  head: () => ({
    meta: [
      { title: "Choose a Model — BackRest Dealer App" },
      {
        name: "description",
        content:
          "Tap a mattress or pillow model to start an order — guarantee, thickness, dealer price and reward points on every card.",
      },
      { property: "og:title", content: "Choose a Model — BackRest Dealer App" },
      {
        property: "og:description",
        content: "Quick tap ordering for BackRest mattresses and pillows.",
      },
    ],
  }),
  component: Catalogue,
});

const tabs = ["Mattresses", "Foldable", "Pillows"] as const;

const productById = new Map(products.map((p) => [p.id, p]));

function Catalogue() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Mattresses");

  const foldable = products.filter((p) => p.category === "Foldable");

  return (
    <AppShell title="Choose a Model">
      <p className="text-sm text-muted-foreground">
        Tap a model name to see details and place your order.
      </p>

      <div className="mt-4 flex gap-2 rounded-2xl bg-secondary/80 p-1">
        {tabs.map((c) => (
          <button
            key={c}
            onClick={() => setTab(c)}
            className={cn(
              "press flex-1 rounded-xl py-2.5 text-sm font-bold transition-colors",
              tab === c
                ? "border border-foreground/20 bg-card text-foreground shadow-soft"
                : "border border-transparent text-muted-foreground",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {tab === "Mattresses" && (
        <div className="mt-5 space-y-4">
          {MATTRESS_LAYERS.map((layer, layerIdx) => (
            <section
              key={layer.id}
              className="animate-rise overflow-hidden rounded-3xl border border-border bg-secondary/40 p-4"
              style={{ animationDelay: `${layerIdx * 60}ms` }}
            >
              <h2 className="flex items-center gap-2 font-display text-base font-bold text-foreground">
                <ShieldCheck className="h-5 w-5 text-primary" strokeWidth={2.25} />
                {layer.title}
              </h2>

              {"subgroups" in layer ? (
                <div className="mt-4 space-y-4">
                  {layer.subgroups.map((sg) => {
                    const items = sg.productIds
                      .map((id) => productById.get(id))
                      .filter((p): p is Product => Boolean(p));
                    if (!items.length) return null;
                    return (
                      <div key={sg.label}>
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          {sg.label}
                        </p>
                        <ProductList products={items} />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-4">
                  <ProductList
                    products={layer.productIds
                      .map((id) => productById.get(id))
                      .filter((p): p is Product => Boolean(p))}
                  />
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {tab === "Foldable" && (
        <section className="animate-rise mt-5 overflow-hidden rounded-3xl border border-border bg-secondary/40 p-4">
          <h2 className="flex items-center gap-2 font-display text-base font-bold">
            <ShieldCheck className="h-5 w-5 text-primary" strokeWidth={2.25} />
            Foldable Mattresses
          </h2>
          <div className="mt-4">
            <ProductList products={foldable} />
          </div>
        </section>
      )}

      {tab === "Pillows" && (
        <section className="animate-rise mt-5 overflow-hidden rounded-3xl border border-border bg-secondary/40 p-4">
          <h2 className="flex items-center gap-2 font-display text-base font-bold">
            <ShieldCheck className="h-5 w-5 text-primary" strokeWidth={2.25} />
            Pillows
          </h2>
          <div className="mt-4">
            <ProductList products={pillows} />
          </div>
        </section>
      )}
    </AppShell>
  );
}

function ProductList({ products: items }: { products: Product[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-soft">
      {items.map((p, i) => (
        <div key={p.id} className={cn(i > 0 && "border-t border-border/70")}>
          <ProductRow product={p} />
        </div>
      ))}
    </div>
  );
}

function ProductRow({ product: p }: { product: Product }) {
  return (
    <Link
      to="/products/$productId"
      params={{ productId: p.id }}
      className="press flex min-w-0 items-center justify-between gap-3 px-4 py-3.5"
    >
      <p className="min-w-0 flex-1 font-display text-[15px] font-bold leading-snug text-foreground">
        {p.name}
      </p>
      <span className="flex shrink-0 items-center gap-0.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground">
        Select
        <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
      </span>
    </Link>
  );
}
