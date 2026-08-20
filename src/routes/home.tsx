import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ShoppingCart,
  Package,
  Gift,
  Megaphone,
  ChevronRight,
  Bell,
} from "lucide-react";
import { AppShell, Section } from "@/components/app-shell";
import { CampaignPopup } from "@/components/campaign-popup";
import { CampaignPriceBlock } from "@/components/campaign-price";
import { CountUp, ProgressBar } from "@/components/brand";
import type { PriceCampaign } from "@/lib/campaign-service";
import {
  formatCampaignDate,
  getActivePriceCampaign,
  getCampaignPrice,
} from "@/lib/campaign-service";
import { requireRoles } from "@/lib/auth-guard";
import { campaigns, dealer, getProduct, inr, products } from "@/lib/demo-data";
import { markCampaignSeen } from "@/lib/notifications";
import {
  getDealerNotifications,
  markNotificationRead,
  type AppNotification,
} from "@/services/dealer-notifications";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/home")({
  beforeLoad: () => requireRoles(["dealer"]),
  head: () => ({
    meta: [
      { title: "Dealer Home — BackRest" },
      {
        name: "description",
        content: "Your points, quick actions, featured products and live campaigns.",
      },
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
  const volumeCampaign = campaigns[1]!;
  const priceCampaign = getActivePriceCampaign("latexo");
  const latexo = getProduct("latexo");
  const campaignPrice = priceCampaign
    ? getCampaignPrice(latexo.price, priceCampaign.discountPercent)
    : null;

  const [popupCampaign, setPopupCampaign] = useState<PriceCampaign | null>(null);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const unread = notifs.filter((n) => !n.read).length;

  useEffect(() => {
    getDealerNotifications().then(setNotifs).catch(() => setNotifs([]));
    const campaign = getActivePriceCampaign("latexo");
    if (campaign) setPopupCampaign(campaign);
  }, []);

  return (
    <AppShell>
      {popupCampaign && (
        <CampaignPopup campaign={popupCampaign} onDismiss={() => setPopupCampaign(null)} />
      )}

      <div className="animate-rise flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Good morning, {dealer.name} 👋</h1>
          <p className="mt-1 text-sm text-muted-foreground">{dealer.shop}</p>
        </div>
        <button
          onClick={() => setShowNotifs((s) => !s)}
          className="press relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-secondary"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5 text-primary" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {unread}
            </span>
          )}
        </button>
      </div>

      {showNotifs && notifs.length > 0 && (
        <div className="animate-rise mt-4 space-y-2 rounded-3xl border border-border bg-card p-3 shadow-soft">
          {notifs.map((n) => (
            <div
              key={n.id}
              className={cn("rounded-2xl border border-border p-3", !n.read && "bg-secondary/60")}
            >
              <p className="text-sm font-bold">{n.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{n.body}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link
                  to={n.link}
                  onClick={async () => {
                    await markNotificationRead(n.id);
                    setNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
                    setShowNotifs(false);
                  }}
                  className="text-xs font-bold text-primary"
                >
                  Open
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

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
        <div className="scrollbar-none -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth-touch px-5 pb-2">
          {products.slice(0, 3).map((p) => (
            <Link
              key={p.id}
              to="/products/$productId"
              params={{ productId: p.id }}
              className="press w-56 shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-card shadow-soft"
            >
              <img
                src={p.image}
                alt={p.name}
                loading="lazy"
                width={800}
                height={800}
                className="h-32 w-full object-cover"
              />
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

      {priceCampaign && campaignPrice && (
        <Section title="Mattress of the Week">
          <Link
            to="/products/$productId"
            params={{ productId: "latexo" }}
            className="press block overflow-hidden rounded-3xl border border-primary/30 bg-card p-5 shadow-soft"
          >
            <p className="font-display text-xl font-bold">{priceCampaign.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {latexo.name} · {priceCampaign.badgeLabel}
            </p>
            <div className="mt-4">
              <CampaignPriceBlock
                mrp={latexo.mrp}
                dealerPrice={latexo.price}
                campaignPrice={campaignPrice}
                compact
              />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Valid until {formatCampaignDate(priceCampaign.endAt)}
            </p>
            <span className="mt-4 flex items-center gap-1 text-sm font-bold text-primary">
              View Campaign <ChevronRight className="h-4 w-4" />
            </span>
          </Link>
        </Section>
      )}

      <Section title="Sell & Earn">
        <Link
          to="/campaigns"
          className="press block rounded-3xl border border-border bg-card p-5 shadow-soft"
        >
          <p className="font-display text-xl font-bold">{volumeCampaign.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{volumeCampaign.goal}</p>
          <p className="mt-3 text-lg font-bold text-primary">+{volumeCampaign.reward}</p>
          <ProgressBar
            value={(volumeCampaign.done / volumeCampaign.target) * 100}
            className="mt-3"
          />
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="font-semibold">
              {volumeCampaign.done} / {volumeCampaign.target} sold
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
