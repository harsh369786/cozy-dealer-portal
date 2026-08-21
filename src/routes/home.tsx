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
import { resolveAssetUrl } from "@/lib/asset-url";
import { campaigns, dealer, getProduct, inr, products } from "@/lib/demo-data";
import { firstName, isDemoDealer } from "@/lib/demo-users";
import { useSession } from "@/hooks/use-session";
import { useAsyncData } from "@/hooks/use-async-data";
import { PageSkeleton } from "@/components/shared/states";
import {
  getDealerNotifications,
  markNotificationRead,
  type AppNotification,
} from "@/services/dealer-notifications";
import { getDealerById } from "@/services/dealers";
import { getRewardBalance, getRewardCatalog } from "@/services/rewards";
import { getCatalog, getProductDetail } from "@/services/catalog";
import { getDealerCampaigns, type DealerCampaign } from "@/services/campaigns";
import type { SessionUser } from "@/lib/mock/distributor/types";
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

type FeaturedProduct = {
  id: string;
  name: string;
  image?: string;
  mrp?: number;
  price?: number;
  points?: number;
};

type ProductionHomeData = {
  dealerProfile: Awaited<ReturnType<typeof getDealerById>>;
  balance: { balance: number; nextRewardAt: number };
  nextReward: { name: string; emoji: string; points: number } | null;
  featured: FeaturedProduct[];
  activeCampaigns: DealerCampaign[];
};

async function loadProductionHome(user: SessionUser): Promise<ProductionHomeData> {
  const [dealerProfile, balance, catalog, rewardCatalog, campaignsRes] = await Promise.all([
    user.dealerId ? getDealerById(user.dealerId) : Promise.resolve(null),
    getRewardBalance(),
    getCatalog(),
    getRewardCatalog(),
    getDealerCampaigns("active"),
  ]);

  const mattressIds = catalog.products
    .filter((p) => p.category === "Mattresses")
    .slice(0, 3)
    .map((p) => p.id);

  const featuredDetails = await Promise.all(
    mattressIds.map((id) =>
      getProductDetail(id)
        .then((p) => ({
          id: String(p.id),
          name: String(p.name),
          image: (p.image_url as string) ?? undefined,
          mrp: p.mrp as number | undefined,
          price: p.price as number | undefined,
          points: p.points as number | undefined,
        }))
        .catch(() => null),
    ),
  );

  const nextReward =
    rewardCatalog.find((r) => r.points > balance.balance) ?? rewardCatalog[0] ?? null;

  return {
    dealerProfile,
    balance,
    nextReward,
    featured: featuredDetails.filter((p): p is FeaturedProduct => p != null),
    activeCampaigns: campaignsRes.campaigns,
  };
}

function HomePage() {
  const { user, loading: sessionLoading } = useSession();

  if (sessionLoading || !user) {
    return (
      <AppShell>
        <PageSkeleton rows={4} />
      </AppShell>
    );
  }

  if (isDemoDealer(user.phone)) {
    return <DemoHomePage user={user} />;
  }

  return <ProductionHomePage user={user} />;
}

function ProductionHomePage({ user }: { user: SessionUser }) {
  const { data, loading } = useAsyncData(
    () => loadProductionHome(user),
    [user.id, user.dealerId],
  );

  if (loading && !data) {
    return (
      <AppShell>
        <PageSkeleton rows={4} />
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Could not load your dashboard.</p>
      </AppShell>
    );
  }

  return <ProductionHomeContent user={user} data={data} />;
}

function HomeHeader({
  greetingName,
  storeName,
  address,
  notifs,
  showNotifs,
  onToggleNotifs,
  onMarkRead,
}: {
  greetingName: string;
  storeName?: string;
  address?: string;
  notifs: AppNotification[];
  showNotifs: boolean;
  onToggleNotifs: () => void;
  onMarkRead: (id: string) => void;
}) {
  const unread = notifs.filter((n) => !n.read).length;

  return (
    <>
      <div className="animate-rise flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold">Good morning, {greetingName} 👋</h1>
          {storeName ? (
            <p className="mt-1 text-sm font-semibold text-foreground">{storeName}</p>
          ) : null}
          {address ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{address}</p>
          ) : null}
        </div>
        <button
          onClick={onToggleNotifs}
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
                  onClick={() => onMarkRead(n.id)}
                  className="text-xs font-bold text-primary"
                >
                  Open
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ProductionHomeContent({ user, data }: { user: SessionUser; data: ProductionHomeData }) {
  const { dealerProfile, balance, nextReward, featured, activeCampaigns } = data;
  const greetingName = firstName(user.name);
  const storeName = dealerProfile?.name;
  const address = dealerProfile?.address ?? dealerProfile?.location;

  const priceCampaign = activeCampaigns.find(
    (c) => c.productId && c.discountPercent && c.discountPercent > 0,
  );
  const volumeCampaign = activeCampaigns.find((c) => c.target && c.target > 0);

  const [priceProduct, setPriceProduct] = useState<FeaturedProduct | null>(null);
  const [popupCampaign, setPopupCampaign] = useState<PriceCampaign | null>(null);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifs, setNotifs] = useState<AppNotification[]>([]);

  const points = balance.balance;
  const nextTarget = nextReward?.points ?? balance.nextRewardAt;
  const remaining = Math.max(0, nextTarget - points);
  const pct = nextTarget > 0 ? Math.min(100, (points / nextTarget) * 100) : 0;

  useEffect(() => {
    getDealerNotifications().then(setNotifs).catch(() => setNotifs([]));
  }, []);

  useEffect(() => {
    if (!priceCampaign?.productId) return;
    getProductDetail(priceCampaign.productId)
      .then((p) =>
        setPriceProduct({
          id: String(p.id),
          name: String(p.name),
          mrp: p.mrp as number | undefined,
          price: p.price as number | undefined,
          points: p.points as number | undefined,
        }),
      )
      .catch(() => setPriceProduct(null));
  }, [priceCampaign?.productId]);

  useEffect(() => {
    if (!priceCampaign?.productId || !priceCampaign.discountPercent) return;
    setPopupCampaign({
      id: priceCampaign.id,
      name: priceCampaign.name,
      productId: priceCampaign.productId,
      discountPercent: priceCampaign.discountPercent,
      startAt: priceCampaign.startDate,
      endAt: priceCampaign.endDate,
      description: priceCampaign.description,
      badgeLabel: priceCampaign.badgeLabel,
    });
  }, [priceCampaign]);

  const campaignPrice =
    priceProduct?.price && priceCampaign?.discountPercent
      ? getCampaignPrice(priceProduct.price, priceCampaign.discountPercent)
      : null;

  return (
    <AppShell>
      {popupCampaign && (
        <CampaignPopup campaign={popupCampaign} onDismiss={() => setPopupCampaign(null)} />
      )}

      <HomeHeader
        greetingName={greetingName}
        storeName={storeName}
        address={address}
        notifs={notifs}
        showNotifs={showNotifs}
        onToggleNotifs={() => setShowNotifs((s) => !s)}
        onMarkRead={async (id) => {
          await markNotificationRead(id);
          setNotifs((prev) => prev.map((x) => (x.id === id ? { ...x, read: true } : x)));
          setShowNotifs(false);
        }}
      />

      <Link
        to="/rewards"
        className="press animate-rise mt-5 block overflow-hidden rounded-3xl border border-border surface-gradient p-5 shadow-lift"
      >
        <p className="text-sm font-semibold text-muted-foreground">Your reward points</p>
        <p className="mt-1 font-display text-5xl font-bold">
          <CountUp value={points} />
          <span className="ml-2 text-lg font-semibold text-muted-foreground">Points</span>
        </p>
        <ProgressBar value={pct} className="mt-4" />
        <p className="mt-3 text-sm">
          {nextReward ? (
            <>
              <span className="font-bold">{remaining} points</span> away from {nextReward.name}{" "}
              {nextReward.emoji}
            </>
          ) : (
            <span className="text-muted-foreground">Start ordering to earn reward points</span>
          )}
        </p>
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

      {featured.length > 0 && (
        <Section
          title="Featured Products"
          action={
            <Link to="/products" className="text-sm font-bold text-primary">
              See all
            </Link>
          }
        >
          <div className="scrollbar-none -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth-touch px-5 pb-2">
            {featured.map((p) => (
              <Link
                key={p.id}
                to="/products/$productId"
                params={{ productId: p.id }}
                className="press w-56 shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-card shadow-soft"
              >
                {p.image ? (
                  <img
                    src={resolveAssetUrl(p.image)}
                    alt={p.name}
                    loading="lazy"
                    className="h-32 w-full object-cover"
                  />
                ) : (
                  <div className="grid h-32 place-items-center bg-secondary text-sm text-muted-foreground">
                    No image
                  </div>
                )}
                <div className="p-3">
                  <p className="text-base font-bold leading-snug">{p.name}</p>
                  {p.price != null && (
                    <p className="mt-1 text-sm text-muted-foreground">From {inr(p.price)}</p>
                  )}
                  {p.points != null && (
                    <p className="mt-1 text-sm font-semibold text-primary">Earn {p.points} points</p>
                  )}
                  <span className="press mt-3 block rounded-xl brand-gradient py-2.5 text-center text-sm font-bold text-primary-foreground">
                    Order
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {priceCampaign && priceProduct && campaignPrice && (
        <Section title="Campaign highlight">
          <Link
            to="/products/$productId"
            params={{ productId: priceProduct.id }}
            search={{ campaignId: priceCampaign.id }}
            className="press block overflow-hidden rounded-3xl border border-primary/30 bg-card p-5 shadow-soft"
          >
            <p className="font-display text-xl font-bold">{priceCampaign.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {priceProduct.name} · {priceCampaign.badgeLabel ?? `${priceCampaign.discountPercent}% off`}
            </p>
            <div className="mt-4">
              <CampaignPriceBlock
                mrp={priceProduct.mrp ?? priceProduct.price ?? 0}
                dealerPrice={priceProduct.price ?? 0}
                campaignPrice={campaignPrice}
                compact
              />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Valid until {formatCampaignDate(priceCampaign.endDate)}
            </p>
          </Link>
        </Section>
      )}

      {volumeCampaign && volumeCampaign.target && (
        <Section title="Sell & Earn">
          <Link
            to="/campaigns"
            className="press block rounded-3xl border border-border bg-card p-5 shadow-soft"
          >
            <p className="font-display text-xl font-bold">{volumeCampaign.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{volumeCampaign.description}</p>
            {volumeCampaign.badgeLabel && (
              <p className="mt-3 text-lg font-bold text-primary">{volumeCampaign.badgeLabel}</p>
            )}
            <ProgressBar
              value={((volumeCampaign.done ?? 0) / volumeCampaign.target) * 100}
              className="mt-3"
            />
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="font-semibold">
                {volumeCampaign.done ?? 0} / {volumeCampaign.target} sold
              </span>
              <span className="flex items-center gap-1 font-bold text-primary">
                View Campaign <ChevronRight className="h-4 w-4" />
              </span>
            </div>
          </Link>
        </Section>
      )}
    </AppShell>
  );
}

function DemoHomePage({ user }: { user: SessionUser | null }) {
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

  useEffect(() => {
    getDealerNotifications().then(setNotifs).catch(() => setNotifs([]));
    const campaign = getActivePriceCampaign("latexo");
    if (campaign) setPopupCampaign(campaign);
  }, []);

  const greetingName = user?.name ? firstName(user.name) : dealer.name;

  return (
    <AppShell>
      {popupCampaign && (
        <CampaignPopup campaign={popupCampaign} onDismiss={() => setPopupCampaign(null)} />
      )}

      <HomeHeader
        greetingName={greetingName}
        storeName={dealer.shop.split(",")[0]?.trim() ?? dealer.shop}
        address={dealer.shop.includes(",") ? dealer.shop.split(",").slice(1).join(",").trim() : undefined}
        notifs={notifs}
        showNotifs={showNotifs}
        onToggleNotifs={() => setShowNotifs((s) => !s)}
        onMarkRead={async (id) => {
          await markNotificationRead(id);
          setNotifs((prev) => prev.map((x) => (x.id === id ? { ...x, read: true } : x)));
          setShowNotifs(false);
        }}
      />

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
                src={resolveAssetUrl(p.image)}
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
