import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import { inr, orders, orderSteps } from "@/lib/demo-data";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "Track Orders — BackRest Dealer App" },
      { name: "description", content: "See every BackRest order and where it has reached, in plain language." },
      { property: "og:title", content: "Track Orders — BackRest Dealer App" },
      { property: "og:description", content: "A simple, visual timeline for each dealer order." },
    ],
  }),
  component: Orders,
});

function Orders() {
  return (
    <AppShell title="My Orders">
      <div className="space-y-4">
        {orders.map((o, i) => (
          <div
            key={o.id}
            className="animate-rise rounded-3xl border border-border bg-card p-5 shadow-soft"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-display text-lg font-bold">Order #{o.id}</p>
                <p className="mt-1 text-sm text-muted-foreground">Placed {o.placed}</p>
              </div>
              <span
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-bold",
                  o.step === 4 ? "bg-success text-success-foreground" : "bg-secondary text-foreground",
                )}
              >
                {orderSteps[o.step]}
              </span>
            </div>

            <div className="mt-4 rounded-2xl bg-secondary/60 px-4 py-3">
              <p className="text-base font-bold">{o.product}</p>
              <p className="text-sm text-muted-foreground">{o.detail}</p>
              <p className="mt-1 font-display text-xl font-bold">{inr(o.amount)}</p>
            </div>

            <p className="mt-5 text-sm font-bold">Order Timeline</p>
            <ol className="mt-3">
              {orderSteps.map((s, idx) => {
                const done = idx < o.step;
                const current = idx === o.step;
                return (
                  <li key={s} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={cn(
                          "grid h-7 w-7 place-items-center rounded-full border-2 text-xs font-bold",
                          done && "border-transparent brand-gradient text-primary-foreground",
                          current && "border-primary text-primary",
                          !done && !current && "border-border text-muted-foreground",
                        )}
                      >
                        {done ? <Check className="h-4 w-4" strokeWidth={3} /> : current ? "●" : ""}
                      </span>
                      {idx < orderSteps.length - 1 && (
                        <span className={cn("w-0.5 flex-1", done ? "bg-primary" : "bg-border")} />
                      )}
                    </div>
                    <span
                      className={cn(
                        "pb-5 text-base",
                        done || current ? "font-bold" : "text-muted-foreground",
                      )}
                    >
                      {s}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
