import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { ProgressBar } from "@/components/brand";
import type { PriceCampaign } from "@/lib/campaign-service";
import {
  formatCampaignDate,
  getCampaignPrice,
} from "@/lib/campaign-service";
import { requireRoles } from "@/lib/auth-guard";
import { resolveAssetUrl } from "@/lib/asset-url";
import { useFormat } from "@/hooks/use-format";
import i18n from "@/lib/i18n";
import { useSession } from "@/hooks/use-session";
import { useAsyncData } from "@/hooks/use-async-data";
import { PageSkeleton } from "@/components/shared/states";
import { getDealerNotifications,
  markNotificationRead,
  type AppNotification,
} from "@/services/dealer-notifications";
import { resolveDealerNotificationLink } from "@/lib/notification-links";
import { localizeNotification } from "@/lib/localize-notification";
import { isCampaignUnseen } from "@/lib/notifications";
import { DealerRewardsCard } from "@/components/shared/dealer-rewards-card";
import { useDealerRewards } from "@/hooks/use-dealer-rewards";
import { getDealerById } from "@/services/dealers";
import { getCatalog, getProductDetail } from "@/services/catalog";
import { getDealerCampaigns, type DealerCampaign } from "@/services/campaigns";
import type { SessionUser } from "@/lib/mock/distributor/types";
import { cn } from "@/lib/utils";

const DemoHomePage = lazy(() => import("@/components/demo-home-page"));

export const Route = createFileRoute("/home")({
  beforeLoad: () => requireRoles(["dealer"]),
  head: () => ({
    meta: [
      { title: i18n.t("dealer.meta.homeTitle") },
      {
        name: "description",
        content: i18n.t("dealer.meta.homeDescription"),
      },
      { property: "og:title", content: i18n.t("dealer.meta.homeTitle") },
      { property: "og:description", content: i18n.t("dealer.meta.homeDescription") },
    ],
  }),
  component: HomePage,
});

const quick = [
  { to: "/products", labelKey: "nav.dealer.orderProducts", icon: ShoppingCart },
  { to: "/orders", labelKey: "nav.dealer.myOrders", icon: Package },
  { to: "/rewards", labelKey: "nav.dealer.rewards", icon: Gift },
  { to: "/campaigns", labelKey: "nav.dealer.campaigns", icon: Megaphone },
] as const;

type FeaturedProduct = {
  id: string;
  name: string;
  image?: string;
  mrp?: number;
  price?: number;
  unitPrice?: number;
  campaignPrice?: number | null;
  points?: number;
};

type ProductionHomeData = {
  dealerProfile: Awaited<ReturnType<typeof getDealerById>>;
  featured: FeaturedProduct[];
  activeCampaigns: DealerCampaign[];
};

function firstName(fullName: string | undefined | null): string {
  const trimmed = String(fullName ?? "").trim();
  return trimmed ? (trimmed.split(/\s+/)[0] ?? trimmed) : "there";
}

function isDemoDealerPhone(phone: string | undefined | null): boolean {
  return String(phone ?? "").replace(/\D/g, "").slice(-10) === "9876543210";
}

async function loadProductionHome(user: SessionUser): Promise<ProductionHomeData> {
  const [dealerProfile, catalog, campaignsRes] = await Promise.all([
    user.dealerId ? getDealerById(user.dealerId) : Promise.resolve(null),
    getCatalog(),
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
          unitPrice: p.unitPrice as number | undefined,
          campaignPrice: (p.campaignPrice as number | null | undefined) ?? null,
          points: p.points as number | undefined,
        }))
        .catch(() => null),
    ),
  );

  return {
    dealerProfile,
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

  if (import.meta.env.DEV && isDemoDealerPhone(user.phone)) {
    return (
      <Suspense
        fallback={
          <AppShell>
            <PageSkeleton rows={4} />
          </AppShell>
        }
      >
        <DemoHomePage user={user} />
      </Suspense>
    );
  }

  return <ProductionHomePage user={user} />;
}

function ProductionHomePage({ user }: { user: SessionUser }) {
  const { t } = useTranslation();
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
        <p className="text-sm text-muted-foreground">{t("common.couldNotLoadDashboard")}</p>
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
  notifsLoading,
  showNotifs,
  onToggleNotifs,
  onMarkRead,
}: {
  greetingName: string;
  storeName?: string;
  address?: string;
  notifs: AppNotification[];
  notifsLoading?: boolean;
  showNotifs: boolean;
  onToggleNotifs: () => void;
  onMarkRead: (id: string) => void;
}) {
  const { t } = useTranslation();
  const unread = notifs.filter((n) => !n.read).length;

  return (
    <>
      <div className="animate-rise flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold">
            {t("common.goodMorning", { name: greetingName })}
          </h1>
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
          aria-label={t("common.notifications")}
        >
          <Bell className="h-5 w-5 text-primary" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {unread}
            </span>
          )}
        </button>
      </div>

      {showNotifs && (
        <div className="animate-rise mt-4 space-y-2 rounded-3xl border border-border bg-card p-3 shadow-soft">
          {notifsLoading ? (
            <>
              <div className="h-16 animate-pulse rounded-2xl bg-secondary/80" aria-hidden />
              <div className="h-16 animate-pulse rounded-2xl bg-secondary/80" aria-hidden />
            </>
          ) : notifs.length > 0 ? (
          notifs.map((n) => {
            const resolved = resolveDealerNotificationLink(n.link);
            const localized = localizeNotification(n, t);
            return (
            <div
              key={n.id}
              className={cn("rounded-2xl border border-border p-3", !n.read && "bg-secondary/60")}
            >
              <p className="text-sm font-bold">{localized.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{localized.body}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link
                  to={resolved.to}
                  params={resolved.params}
                  search={resolved.search}
                  onClick={() => onMarkRead(n.id)}
                  className="text-xs font-bold text-primary"
                >
                  {t("common.open")}
                </Link>
              </div>
            </div>
            );
          })
          ) : (
            <p className="text-sm text-muted-foreground">{t("distributor.noNotifications")}</p>
          )}
        </div>
      )}
    </>
  );
}

function HomeRewardsSection() {
  const { summary, loading } = useDealerRewards();

  if (loading && !summary) {
    return <div className="mt-5 h-44 animate-pulse rounded-3xl bg-secondary/80" aria-hidden />;
  }
  if (!summary) return null;

  return <DealerRewardsCard summary={summary} className="animate-rise mt-5" />;
}

function ProductionHomeContent({ user, data }: { user: SessionUser; data: ProductionHomeData }) {
  const { t } = useTranslation();
  const { formatCurrency } = useFormat();
  const { dealerProfile, featured, activeCampaigns } = data;
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
  const [notifsLoading, setNotifsLoading] = useState(false);

  useEffect(() => {
    if (!showNotifs) return;
    setNotifsLoading(true);
    getDealerNotifications()
      .then(setNotifs)
      .catch(() => setNotifs([]))
      .finally(() => setNotifsLoading(false));
  }, [showNotifs]);

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
    if (!isCampaignUnseen(priceCampaign.id, user.id)) return;
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
  }, [priceCampaign, user.id]);

  const campaignPrice =
    priceProduct?.price && priceCampaign?.discountPercent
      ? getCampaignPrice(priceProduct.price, priceCampaign.discountPercent)
      : null;

  return (
    <AppShell>
      {popupCampaign && (
        <CampaignPopup
          campaign={popupCampaign}
          userId={user.id}
          productName={priceProduct?.name}
          onDismiss={() => setPopupCampaign(null)}
        />
      )}

      <HomeHeader
        greetingName={greetingName}
        storeName={storeName}
        address={address}
        notifs={notifs}
        notifsLoading={notifsLoading}
        showNotifs={showNotifs}
        onToggleNotifs={() => setShowNotifs((s) => !s)}
        onMarkRead={async (id) => {
          await markNotificationRead(id);
          setNotifs((prev) => prev.map((x) => (x.id === id ? { ...x, read: true } : x)));
          setShowNotifs(false);
        }}
      />

      <HomeRewardsSection />

      <Section title={t("common.quickActions")}>
        <div className="grid grid-cols-2 gap-3">
          {quick.map(({ to, labelKey, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="press flex min-h-24 flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-soft"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-secondary">
                <Icon className="h-5 w-5 text-primary" />
              </span>
              <span className="text-base font-bold">{t(labelKey)}</span>
            </Link>
          ))}
        </div>
      </Section>

      {featured.length > 0 && (
        <Section
          title={t("common.featuredProducts")}
          action={
            <Link to="/products" className="text-sm font-bold text-primary">
              {t("common.seeAll")}
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
                    {t("common.noImage")}
                  </div>
                )}
                <div className="p-3">
                  <p className="text-base font-bold leading-snug">{p.name}</p>
                  {p.price != null && (
                    <div className="mt-1">
                      {p.campaignPrice != null && p.campaignPrice < p.price ? (
                        <>
                          <p className="text-sm text-muted-foreground line-through">
                            {t("common.dealerLabel", { price: formatCurrency(p.price) })}
                          </p>
                          <p className="text-sm font-bold text-primary">{formatCurrency(p.campaignPrice)}</p>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {t("common.from")} {formatCurrency(p.unitPrice ?? p.price)}
                        </p>
                      )}
                    </div>
                  )}
                  {p.points != null && (
                    <p className="mt-1 text-sm font-semibold text-primary">
                      {t("common.earn")} {p.points} {t("common.points")}
                    </p>
                  )}
                  <span className="press mt-3 block rounded-xl brand-gradient py-2.5 text-center text-sm font-bold text-primary-foreground">
                    {t("common.order")}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {priceCampaign && priceProduct && campaignPrice && (
        <Section title={t("common.campaignHighlight")}>
          <Link
            to="/products/$productId"
            params={{ productId: priceProduct.id }}
            search={{ campaignId: priceCampaign.id }}
            className="press block overflow-hidden rounded-3xl border border-primary/30 bg-card p-5 shadow-soft"
          >
            <p className="font-display text-xl font-bold">{priceCampaign.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {priceProduct.name} ·{" "}
              {priceCampaign.badgeLabel ??
                t("common.percentOff", { percent: priceCampaign.discountPercent })}
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
              {t("common.validUntil")} {formatCampaignDate(priceCampaign.endDate)}
            </p>
          </Link>
        </Section>
      )}

      {volumeCampaign && volumeCampaign.target && (
        <Section title={t("common.sellAndEarn")}>
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
                {t("common.soldProgress", {
                  done: volumeCampaign.done ?? 0,
                  target: volumeCampaign.target,
                })}
              </span>
              <span className="flex items-center gap-1 font-bold text-primary">
                {t("common.viewCampaign")} <ChevronRight className="h-4 w-4" />
              </span>
            </div>
          </Link>
        </Section>
      )}
    </AppShell>
  );
}
