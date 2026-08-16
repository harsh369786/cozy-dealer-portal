import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import { getProduct, inr } from "@/lib/demo-data";

export const Route = createFileRoute("/products/$productId")({
  head: () => ({
    meta: [
      { title: "Product Details — BackRest Dealer App" },
      { name: "description", content: "Pick a size, choose quantity and add the product to your order." },
      { property: "og:title", content: "Product Details — BackRest Dealer App" },
      { property: "og:description", content: "Simple ordering: size, quantity, reward points, done." },
    ],
  }),
  component: ProductDetails,
});

function ProductDetails() {
  const { productId } = useParams({ from: "/products/$productId" });
  const product = getProduct(productId);
  const navigate = useNavigate();
  const [size, setSize] = useState(product.sizes[0]);
  const [qty, setQty] = useState(10);

  return (
    <AppShell title={product.name} back="/products">
      <img
        src={product.image}
        alt={product.name}
        width={800}
        height={800}
        className="animate-rise h-64 w-full rounded-3xl object-cover"
      />

      <div className="mt-5 animate-rise">
        <h2 className="font-display text-2xl font-bold">{product.name}</h2>
        <p className="mt-1 text-base text-muted-foreground">{product.blurb}</p>

        <ul className="mt-4 space-y-2">
          {product.benefits.map((b) => (
            <li key={b} className="flex items-center gap-2 text-sm font-semibold">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-secondary">
                <Check className="h-3.5 w-3.5 text-primary" />
              </span>
              {b}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6">
        <p className="text-base font-bold">Size</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {product.sizes.map((s) => (
            <button
              key={s}
              onClick={() => setSize(s)}
              className={cn(
                "press rounded-2xl border py-4 text-base font-bold",
                size === s
                  ? "border-transparent brand-gradient text-primary-foreground"
                  : "border-border bg-card",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-base font-bold">Quantity</p>
        <div className="mt-3 flex items-center justify-between rounded-2xl border border-border bg-card p-2">
          <button
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            aria-label="Reduce quantity"
            className="press grid h-14 w-14 place-items-center rounded-xl bg-secondary"
          >
            <Minus className="h-6 w-6" />
          </button>
          <span className="font-display text-3xl font-bold">{qty}</span>
          <button
            onClick={() => setQty((q) => q + 1)}
            aria-label="Increase quantity"
            className="press grid h-14 w-14 place-items-center rounded-xl bg-secondary"
          >
            <Plus className="h-6 w-6" />
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-border surface-gradient p-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Dealer price</p>
            <p className="font-display text-3xl font-bold">{inr(product.price * qty)}</p>
            <p className="text-xs text-muted-foreground">
              {inr(product.price)} × {qty}
            </p>
          </div>
          <p className="text-base font-bold text-primary">
            You'll earn {product.points * qty} points 🎁
          </p>
        </div>
      </div>

      <button
        onClick={() =>
          navigate({ to: "/order", search: { p: product.id, size, qty } })
        }
        className="press mt-6 h-16 w-full rounded-2xl brand-gradient text-lg font-bold text-primary-foreground"
      >
        Add to Order
      </button>
    </AppShell>
  );
}
