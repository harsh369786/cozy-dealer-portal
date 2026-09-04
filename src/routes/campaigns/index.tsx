import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, ChevronRight, MessageSquareWarning, User } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CampaignPriceBlock } from "@/components/campaign-price";
import { ProgressBar } from "@/components/brand";
import { SearchBar, matchesSearch } from "@/components/shared/search-bar";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { requireRoles } from "@/lib/auth-guard";
import { resolveAssetUrl } from "@/lib/asset-url";
import { formatCampaignDate } from "@/lib/campaign-service";
import { cn } from "@/lib/utils";
import { getDealerCampaigns, type DealerCampaign } from "@/services/campaigns";
import { getProductDetail } from "@/services/catalog";
import i18n from "@/lib/i18n";

export const Route = createFileRoute("/campaigns/")({
  beforeLoad: () => requireRoles(["dealer"]),
  head: () => ({
    meta: [
      { title: i18n.t("dealer.meta.campaignsTitle") },
      {
        name: "description",
        content: i18n.t("dealer.meta.campaignsDescription"),
      },
      { property: "og:title", content: i18n.t("dealer.meta.campaignsTitle") },
      {
        property: "og:description",
        content: i18n.t("dealer.meta.campaignsDescription"),
      },
    ],
  }),
  component: Campaigns,
});

type CampaignTab = "active" | "upcoming" | "expired";

function campaignSearchText(campaign: DealerCampaign) {
  return [
    campaign.name,
    campaign.productName,
    campaign.description,
    campaign.badgeLabel,
    campaign.discountPercent != null ? String(campaign.discountPercent) : "",
  ];
}

function Campaigns() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<CampaignTab>("active");
  const [search, setSearch] = useState("");

  const campaignTabs: { id: CampaignTab; labelKey: string }[] = [
    { id: "active", labelKey: "campaignStatus.active" },
    { id: "upcoming", labelKey: "campaignStatus.upcoming" },
    { id: "expired", labelKey: "campaignStatus.expired" },
  ];

  const { data, loading, error, retry } = useAsyncData(() => getDealerCampaigns(tab), [tab]);

  const campaigns = useMemo(
    () =>
      data?.campaigns.filter((campaign) => matchesSearch(search, ...campaignSearchText(campaign))) ??
      [],
    [data, search],
  );

  return (
    <AppShell title={t("dealer.campaigns.title")}>
      <SearchBar value={search} onChange={setSearch} placeholder={t("common.searchCampaigns")} />

      <div className="mt-4 flex gap-2 rounded-2xl bg-secondary p-1">
        {campaignTabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "press flex-1 rounded-xl py-2.5 text-sm font-bold",
              tab === item.id ? "bg-card shadow-soft" : "text-muted-foreground",
            )}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </div>

      {loading && (
        <div className="mt-5">
          <PageSkeleton rows={3} />
        </div>
      )}
      {error && (
        <div className="mt-5">
          <ErrorState message={error} onRetry={retry} />
        </div>
      )}

      {!loading && !error && (
        <div className="mt-5 space-y-4">
          {campaigns.length === 0 ? (
            <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              {search.trim()
                ? t("common.noCampaignsSearch")
                : t("common.noCampaignsTab", { tab: t(`campaignStatus.${tab}`) })}
            </p>
          ) : (
            campaigns.map((campaign, i) => (
              <DealerCampaignCard key={campaign.id} campaign={campaign} tab={tab} index={i} />
            ))
          )}
        </div>
      )}

      <div className="mt-8 space-y-2">
        <p className="font-display font-bold">{t("common.more")}</p>
        <Link
          to="/complaints"
          className="press flex items-center gap-4 rounded-3xl border border-border bg-card p-4 shadow-soft"
        >
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-secondary">
            <MessageSquareWarning className="h-5 w-5 text-primary" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t("nav.dealer.complaints")}</p>
            <p className="text-sm text-muted-foreground">{t("common.helpTrackComplaints")}</p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </Link>
        <Link
          to="/profile"
          className="press flex items-center gap-4 rounded-3xl border border-border bg-card p-4 shadow-soft"
        >
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-secondary">
            <User className="h-5 w-5 text-primary" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t("common.myProfile")}</p>
            <p className="text-sm text-muted-foreground">{t("common.accountDetailsSignOut")}</p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </Link>
      </div>
    </AppShell>
  );
}

function DealerCampaignCard({
  campaign,
  tab,
  index,
}: {
  campaign: DealerCampaign;
  tab: CampaignTab;
  index: number;
}) {
  const { t } = useTranslation();
  const { data: productDetail } = useAsyncData(
    () =>
      campaign.productId
        ? getProductDetail(campaign.productId, { campaignId: campaign.id })
        : Promise.resolve(null),
    [campaign.productId, campaign.id],
  );

  const dealerPrice = typeof productDetail?.price === "number" ? productDetail.price : undefined;
  const campaignPrice =
    typeof productDetail?.campaignPrice === "number" ? productDetail.campaignPrice : null;
  const mrp = typeof productDetail?.mrp === "number" ? productDetail.mrp : 0;
  const hasProductPricing = Boolean(campaign.productId && dealerPrice != null && campaignPrice != null);
  const hasVolumeGoal = Boolean(campaign.target && campaign.target > 0);
  const pct = hasVolumeGoal && campaign.target ? ((campaign.done ?? 0) / campaign.target) * 100 : 0;

  return (
    <section
      className="animate-rise overflow-hidden rounded-3xl border border-border bg-card shadow-soft"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      {campaign.imageUrl ? (
        <img
          src={resolveAssetUrl(campaign.imageUrl)}
          alt={campaign.name}
          className="h-40 w-full object-cover"
        />
      ) : (
        <div className="brand-gradient px-5 py-6 text-primary-foreground">
          <p className="text-3xl">{hasVolumeGoal ? "🎯" : "🔥"}</p>
        </div>
      )}
      <div className="brand-gradient px-5 py-4 text-primary-foreground">
        <p className="font-display text-xl font-bold">{campaign.name}</p>
        {campaign.productName && (
          <p className="mt-1 text-sm font-semibold opacity-90">
            {t("dealer.campaigns.productLabel", { name: campaign.productName })}
          </p>
        )}
        <p className="mt-2 text-sm font-bold">
          {campaign.badgeLabel ??
            (campaign.discountPercent
              ? t("common.percentCampaignDiscount", { percent: campaign.discountPercent })
              : t("common.campaignOffer"))}
        </p>
      </div>
      <div className="p-5">
        {hasProductPricing && dealerPrice != null && campaignPrice != null && (
          <CampaignPriceBlock isFromPrice mrp={mrp} dealerPrice={dealerPrice} campaignPrice={campaignPrice} />
        )}
        <p className="mt-4 text-sm text-muted-foreground">{campaign.description}</p>
        {hasVolumeGoal && tab === "active" && (
          <>
            <ProgressBar value={pct} className="mt-4" />
            <div className="mt-2 flex items-center justify-between text-sm font-semibold">
              <span>
                {t("common.soldProgress", {
                  done: campaign.done ?? 0,
                  target: campaign.target ?? 0,
                })}
              </span>
              <span className="text-muted-foreground">
                {t("common.moreToGo", {
                  count: Math.max(0, (campaign.target ?? 0) - (campaign.done ?? 0)),
                })}
              </span>
            </div>
          </>
        )}
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <CalendarDays className="h-4 w-4" />
          {formatCampaignDate(campaign.startDate)} – {formatCampaignDate(campaign.endDate)}
        </p>
        {tab !== "expired" && campaign.productId && (
          <Link
            to="/products/$productId"
            params={{ productId: campaign.productId }}
            search={{ campaignId: campaign.id }}
            className="press mt-5 block rounded-2xl brand-gradient py-4 text-center text-base font-bold text-primary-foreground"
          >
            {t("common.orderProduct", { productName: campaign.productName ?? t("common.product") })}
          </Link>
        )}
        {tab !== "expired" && !campaign.productId && (
          <Link
            to="/products"
            className="press mt-4 block rounded-2xl border border-border bg-secondary py-3.5 text-center text-base font-bold"
          >
            {tab === "upcoming" ? t("common.viewProducts") : t("common.startSelling")}
          </Link>
        )}
      </div>
    </section>
  );
}
