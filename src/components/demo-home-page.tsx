import { Link } from "@tanstack/react-router";
import { Bell, ChevronRight, Gift, Megaphone, Package, ShoppingCart } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell, Section } from "@/components/app-shell";
import { ProgressBar } from "@/components/brand";
import { CampaignPopup } from "@/components/campaign-popup";
import { CampaignPriceBlock } from "@/components/campaign-price";
import { DealerRewardsCard } from "@/components/shared/dealer-rewards-card";
import { useDealerRewards } from "@/hooks/use-dealer-rewards";
import { useFormat } from "@/hooks/use-format";
import {
  formatCampaignDate,
  getCampaignPrice,
  isCampaignActive,
  type PriceCampaign,
} from "@/lib/campaign-service";
import { campaigns, dealer, getProduct, priceCampaigns, products } from "@/lib/demo-data";
import { firstName } from "@/lib/demo-users";
import type { SessionUser } from "@/lib/mock/distributor/types";
import { resolveDealerNotificationLink } from "@/lib/notification-links";
import { isCampaignUnseen } from "@/lib/notifications";
import { resolveAssetUrl } from "@/lib/asset-url";
import { localizeNotification } from "@/lib/localize-notification";
import { cn } from "@/lib/utils";
import {
  getDealerNotifications,
  markNotificationRead,
  type AppNotification,
} from "@/services/dealer-notifications";

const quick = [
  { to: "/products", labelKey: "nav.dealer.orderProducts", icon: ShoppingCart },
  { to: "/orders", labelKey: "nav.dealer.myOrders", icon: Package },
  { to: "/rewards", labelKey: "nav.dealer.rewards", icon: Gift },
  { to: "/campaigns", labelKey: "nav.dealer.campaigns", icon: Megaphone },
] as const;

function getActivePriceCampaign(productId: string, at = new Date()): PriceCampaign | null {
  return (
    priceCampaigns.find(
      (campaign) => campaign.productId === productId && isCampaignActive(campaign, at),
    ) ?? null
  );
}

function DemoHeader({
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
  const { t } = useTranslation();
  const unread = notifs.filter((notification) => !notification.read).length;

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
          {address ? <p className="mt-0.5 text-sm text-muted-foreground">{address}</p> : null}
        </div>
        <button
          type="button"
          onClick={onToggleNotifs}
          className="press relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-secondary"
          aria-label={t("common.notifications")}
        >
          <Bell className="h-5 w-5 text-primary" />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {unread}
            </span>
          ) : null}
        </button>
      </div>

      {showNotifs && notifs.length > 0 ? (
        <div className="animate-rise mt-4 space-y-2 rounded-3xl border border-border bg-card p-3 shadow-soft">
          {notifs.map((notification) => {
            const resolved = resolveDealerNotificationLink(notification.link);
            const localized = localizeNotification(notification, t);
            return (
              <div
                key={notification.id}
                className={cn(
                  "rounded-2xl border border-border p-3",
                  !notification.read && "bg-secondary/60",
                )}
              >
                <p className="text-sm font-bold">{localized.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{localized.body}</p>
                <Link
                  to={resolved.to}
                  params={resolved.params}
                  search={resolved.search}
                  onClick={() => onMarkRead(notification.id)}
                  className="mt-2 inline-block text-xs font-bold text-primary"
                >
                  {t("common.open")}
                </Link>
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

function DemoRewardsSection() {
  const { summary, loading } = useDealerRewards();
  if (loading && !summary) {
    return <div className="mt-5 h-44 animate-pulse rounded-3xl bg-secondary/80" aria-hidden />;
  }
  return summary ? <DealerRewardsCard summary={summary} className="animate-rise mt-5" /> : null;
}

export default function DemoHomePage({ user }: { user: SessionUser }) {
  const { t } = useTranslation();
  const { formatCurrency } = useFormat();
  const volumeCampaign = campaigns[1] ?? campaigns[0];
  const priceCampaign = getActivePriceCampaign("latexo");
  const latexo = getProduct("latexo");
  const campaignPrice = priceCampaign
    ? getCampaignPrice(latexo.price, priceCampaign.discountPercent)
    : null;

  const [popupCampaign, setPopupCampaign] = useState<PriceCampaign | null>(null);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifs, setNotifs] = useState<AppNotification[]>([]);

  useEffect(() => {
    getDealerNotifications()
      .then(setNotifs)
      .catch(() => setNotifs([]));
    const campaign = getActivePriceCampaign("latexo");
    if (campaign && isCampaignUnseen(campaign.id, user.id)) setPopupCampaign(campaign);
  }, [user.id]);

  return (
    <AppShell>
      {popupCampaign ? (
        <CampaignPopup
          campaign={popupCampaign}
          userId={user.id}
          productName={latexo.name}
          onDismiss={() => setPopupCampaign(null)}
        />
      ) : null}

      <DemoHeader
        greetingName={firstName(user.name) || dealer.name}
        storeName={dealer.shop.split(",")[0]?.trim() ?? dealer.shop}
        address={
          dealer.shop.includes(",") ? dealer.shop.split(",").slice(1).join(",").trim() : undefined
        }
        notifs={notifs}
        showNotifs={showNotifs}
        onToggleNotifs={() => setShowNotifs((shown) => !shown)}
        onMarkRead={async (notificationId) => {
          await markNotificationRead(notificationId);
          setNotifs((current) =>
            current.map((notification) =>
              notification.id === notificationId ? { ...notification, read: true } : notification,
            ),
          );
          setShowNotifs(false);
        }}
      />

      <DemoRewardsSection />

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

      <Section
        title={t("common.featuredProducts")}
        action={
          <Link to="/products" className="text-sm font-bold text-primary">
            {t("common.seeAll")}
          </Link>
        }
      >
        <div className="scrollbar-none -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth-touch px-5 pb-2">
          {products.slice(0, 3).map((product) => (
            <Link
              key={product.id}
              to="/products/$productId"
              params={{ productId: product.id }}
              className="press w-56 shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-card shadow-soft"
            >
              <img
                src={resolveAssetUrl(product.image)}
                alt={product.name}
                loading="lazy"
                width={800}
                height={800}
                className="h-32 w-full object-cover"
              />
              <div className="p-3">
                <p className="text-base font-bold leading-snug">{product.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("common.from")} {formatCurrency(product.price)}
                </p>
                <p className="mt-1 text-sm font-semibold text-primary">
                  {t("common.earn")} {product.points} {t("common.points")}
                </p>
                <span className="press mt-3 block rounded-xl brand-gradient py-2.5 text-center text-sm font-bold text-primary-foreground">
                  {t("common.order")}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      {priceCampaign && campaignPrice ? (
        <Section title={t("common.mattressOfTheWeek")}>
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
              {t("common.validUntil")} {formatCampaignDate(priceCampaign.endAt)}
            </p>
            <span className="mt-4 flex items-center gap-1 text-sm font-bold text-primary">
              {t("common.viewCampaign")} <ChevronRight className="h-4 w-4" />
            </span>
          </Link>
        </Section>
      ) : null}

      {volumeCampaign ? (
        <Section title={t("common.sellAndEarn")}>
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
                {t("common.soldProgress", {
                  done: volumeCampaign.done,
                  target: volumeCampaign.target,
                })}
              </span>
              <span className="flex items-center gap-1 font-bold text-primary">
                {t("common.viewCampaign")} <ChevronRight className="h-4 w-4" />
              </span>
            </div>
          </Link>
        </Section>
      ) : null}
    </AppShell>
  );
}
