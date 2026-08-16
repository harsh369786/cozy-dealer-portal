import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ProgressBar } from "@/components/brand";
import { campaigns } from "@/lib/demo-data";

export const Route = createFileRoute("/campaigns")({
  head: () => ({
    meta: [
      { title: "Campaigns — BackRest Dealer App" },
      { name: "description", content: "Live BackRest selling campaigns, your progress and bonus points to win." },
      { property: "og:title", content: "Campaigns — BackRest Dealer App" },
      { property: "og:description", content: "Sell more, earn bonus points — track every campaign." },
    ],
  }),
  component: Campaigns,
});

function Campaigns() {
  return (
    <AppShell title="Campaigns">
      <div className="space-y-4">
        {campaigns.map((c, i) => {
          const pct = (c.done / c.target) * 100;
          return (
            <div
              key={c.id}
              className="animate-rise overflow-hidden rounded-3xl border border-border bg-card shadow-soft"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="brand-gradient px-5 py-6 text-primary-foreground">
                <p className="text-3xl">{c.emoji}</p>
                <p className="mt-2 font-display text-xl font-bold leading-snug">{c.title}</p>
                <p className="mt-1 text-sm font-semibold opacity-90">{c.goal}</p>
              </div>
              <div className="p-5">
                <p className="font-display text-2xl font-bold text-primary">Earn {c.reward}</p>
                <ProgressBar value={pct} className="mt-4" />
                <div className="mt-2 flex items-center justify-between text-sm font-semibold">
                  <span>
                    {c.done} / {c.target}
                  </span>
                  <span className="text-muted-foreground">{c.target - c.done} more to go!</span>
                </div>
                <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <CalendarDays className="h-4 w-4" /> Ends {c.ends}
                </p>
                <Link
                  to="/products"
                  className="press mt-4 block rounded-2xl brand-gradient py-3.5 text-center text-base font-bold text-primary-foreground"
                >
                  Start Selling
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
