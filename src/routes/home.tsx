import { createFileRoute, Link } from "@tanstack/react-router";
import { ShoppingCart, Package, Gift, Megaphone, ChevronRight } from "lucide-react";
import { AppShell, Section } from "@/components/app-shell";
import { CountUp, ProgressBar } from "@/components/brand";
import { campaigns, dealer, inr, products } from "@/lib/demo-data";

export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [
      { title: "Dealer Home — BackRest" },
      { name: "description", content: "Your points, quick actions, featured products and live campaigns." },
      { property: "og:title", content: "Dealer Home — BackRest" },
      { property: "og:description", content: "Points, orders and campaigns at a glance." },
    ],
  }),
  component: HomePage,
});

const quick = [
  { to: "/products", label: "Order Products", icon: ShoppingCart },
  { to: "/orders", label: "My Orders", icon: Package },
  { to: "/rewards", label: "Rewards", icon: Gift },
  { to: "/campaigns", label: "Campaigns", icon: Megaphone },
] as const;

function HomePage() {
  const remaining = dealer.nextRewardAt - dealer.points;
  const pct = (dealer.points / dealer.nextRewardAt) * 100;
  const campaign = campaigns[1]!;

  return (
    <AppShell>
      <div className="animate-rise">
        <h1 className="font-display text-2xl font-bold">Good morning, {dealer.name} 👋</h1>
        <p className="mt-1 text-sm text-muted-foreground">{dealer.shop}</p>
      </div>

      <Link
        to="/rewards"
        className="press animate-rise mt-5 block overflow-hidden rounded-3xl border border-border surface-gradient p-5 shadow-lift"
      >
        <p className="text-sm font-semibold text-muted-foreground">Your reward points</p>
        <p className="mt-1 font-display text-5xl font-bold">
          <CountUp value={dealer.points} />
          <span className="ml-2 text-lg font-semibold text-muted-foreground">Points</span>
        </p>
        <ProgressBar value={pct} className="mt-4" />
        <p className="mt-3 text-sm">
          <span className="font-bold">{remaining} points</span> away from your next reward
        </p>
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-card/70 px-4 py-3">
          <span className="text-sm font-semibold">Next Reward: {dealer.nextReward} 🎁</span>
          <span className="flex items-center gap-1 text-sm font-bold text-primary">
            View Rewards <ChevronRight className="h-4 w-4" />
          </span>
        </div>
      </Link>

      <Section title="Quick Actions">
        <div className="grid grid-cols-2 gap-3">
          {quick.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="press flex min-h-24 flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-soft"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-secondary">
                <Icon className="h-5 w-5 text-primary" />
              </span>
              <span className="text-base font-bold">{label}</span>
            </Link>
          ))}
        </div>
      </Section>

      <Section
        title="Featured Products"
        action={
          <Link to="/products" className="text-sm font-bold text-primary">
            See all
          </Link>
        }
      >
        <div className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-2">
          {products.slice(0, 3).map((p) => (
            <Link
              key={p.id}
              to="/products/$productId"
              params={{ productId: p.id }}
              className="press w-56 shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-card shadow-soft"
            >
              <img src={p.image} alt={p.name} loading="lazy" width={800} height={800} className="h-32 w-full object-cover" />
              <div className="p-3">
                <p className="text-base font-bold leading-snug">{p.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">From {inr(p.price)}</p>
                <p className="mt-1 text-sm font-semibold text-primary">Earn {p.points} points</p>
                <span className="press mt-3 block rounded-xl brand-gradient py-2.5 text-center text-sm font-bold text-primary-foreground">
                  Order
                </span>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      <Section title="Active Campaign">
        <Link
          to="/campaigns"
          className="press block rounded-3xl border border-border bg-card p-5 shadow-soft"
        >
          <p className="font-display text-xl font-bold">{campaign.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{campaign.goal}</p>
          <p className="mt-3 text-lg font-bold text-primary">+{campaign.reward}</p>
          <ProgressBar value={(campaign.done / campaign.target) * 100} className="mt-3" />
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="font-semibold">
              {campaign.done} / {campaign.target} sold
            </span>
            <span className="flex items-center gap-1 font-bold text-primary">
              View Campaign <ChevronRight className="h-4 w-4" />
            </span>
          </div>
        </Link>
      </Section>
    </AppShell>
  );
}
