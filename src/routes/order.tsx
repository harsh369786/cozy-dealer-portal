import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { Check, MapPin, User } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { Confetti } from "@/components/brand";
import { getProduct, inr } from "@/lib/demo-data";

const searchSchema = z.object({
  p: z.string().default("premium-comfort-mattress"),
  size: z.string().default('72 × 60"'),
  qty: z.coerce.number().default(10),
});

export const Route = createFileRoute("/order")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Order Summary — BackRest Dealer App" },
      { name: "description", content: "Check your order, delivery details and reward points before placing it." },
      { property: "og:title", content: "Order Summary — BackRest Dealer App" },
      { property: "og:description", content: "Review and place your BackRest order in one tap." },
    ],
  }),
  component: OrderSummary,
});

function OrderSummary() {
  const { p, size, qty } = useSearch({ from: "/order" });
  const product = getProduct(p);
  const [placed, setPlaced] = useState(false);

  const total = product.price * qty;
  const points = product.points * qty;

  if (placed) {
    return (
      <AppShell title="Order Placed">
        <div className="relative grid min-h-[70vh] place-items-center text-center">
          <Confetti />
          <div>
            <div className="animate-pop mx-auto grid h-24 w-24 place-items-center rounded-full brand-gradient">
              <Check className="h-12 w-12 text-primary-foreground" strokeWidth={3} />
            </div>
            <h2 className="animate-rise mt-6 font-display text-3xl font-bold">Order Received!</h2>
            <p className="mt-2 text-lg font-semibold">Order #BR1025</p>
            <p className="mt-2 text-base text-muted-foreground">
              We'll notify you when your order is approved.
            </p>
            <p className="mt-4 text-base font-bold text-primary">+{points} points added 🎁</p>
            <Link
              to="/orders"
              className="press mt-8 block rounded-2xl brand-gradient px-8 py-4 text-lg font-bold text-primary-foreground"
            >
              Track Order
            </Link>
            <Link to="/home" className="mt-4 block text-sm font-bold text-muted-foreground">
              Back to Home
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Order Summary" back="/products">
      <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
        <div className="flex gap-3">
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            width={800}
            height={800}
            className="h-20 w-20 rounded-2xl object-cover"
          />
          <div className="flex-1">
            <p className="text-base font-bold">{product.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">Size {size}</p>
            <p className="text-sm text-muted-foreground">Quantity {qty}</p>
          </div>
          <p className="font-display text-lg font-bold">{inr(total)}</p>
        </div>
      </div>

      <div className="mt-4 rounded-3xl border border-border bg-card p-4">
        <Row label="Products total" value={inr(total)} />
        <Row label="Delivery" value="Free" />
        <div className="my-3 h-px bg-border" />
        <div className="flex items-center justify-between">
          <span className="text-base font-bold">Total</span>
          <span className="font-display text-2xl font-bold">{inr(total)}</span>
        </div>
        <p className="mt-3 rounded-2xl bg-secondary px-4 py-3 text-sm font-bold text-primary">
          You'll earn {points} reward points 🎁
        </p>
      </div>

      <div className="mt-4 rounded-3xl border border-border bg-card p-4">
        <Detail icon={User} title="Customer" lines={["Sharma Furnishings", "Rajesh Sharma · +91 98765 43210"]} />
        <div className="my-3 h-px bg-border" />
        <Detail
          icon={MapPin}
          title="Delivery"
          lines={["Plot 22, Sitabuldi Market", "Nagpur, Maharashtra 440012", "Expected in 5–7 days"]}
        />
      </div>

      <button
        onClick={() => setPlaced(true)}
        className="press mt-6 h-16 w-full rounded-2xl brand-gradient text-lg font-bold text-primary-foreground"
      >
        Place Order
      </button>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function Detail({
  icon: Icon,
  title,
  lines,
}: {
  icon: typeof User;
  title: string;
  lines: string[];
}) {
  return (
    <div className="flex gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary">
        <Icon className="h-5 w-5 text-primary" />
      </span>
      <div>
        <p className="text-sm font-bold">{title}</p>
        {lines.map((l) => (
          <p key={l} className="text-sm text-muted-foreground">
            {l}
          </p>
        ))}
      </div>
    </div>
  );
}
