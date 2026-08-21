import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarDays, ChevronRight, MessageSquareWarning, User } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CampaignPriceBlock } from "@/components/campaign-price";
import { ProgressBar } from "@/components/brand";
import { SearchBar, matchesSearch } from "@/components/shared/search-bar";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { requireRoles } from "@/lib/auth-guard";
import { resolveAssetUrl } from "@/lib/asset-url";
import {
  formatCampaignDate,
  getCampaignPrice,
} from "@/lib/campaign-service";
import { getProduct } from "@/lib/demo-data";
import { cn } from "@/lib/utils";
import { getDealerCampaigns, type DealerCampaign } from "@/services/campaigns";

export const Route = createFileRoute("/campaigns")({
  beforeLoad: () => requireRoles(["dealer"]),
  head: () => ({
    meta: [
      { title: "Campaigns — BackRest Dealer App" },
      {
        name: "description",
        content: "Live BackRest selling campaigns, your progress and bonus points to win.",
      },
      { property: "og:title", content: "Campaigns — BackRest Dealer App" },
      {
        property: "og:description",
        content: "Sell more, earn bonus points — track every campaign.",
      },
    ],
  }),
  component: Campaigns,
});

type CampaignTab = "active" | "upcoming" | "expired";

const campaignTabs: { id: CampaignTab; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "upcoming", label: "Upcoming" },
  { id: "expired", label: "Expired" },
];

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
  const [tab, setTab] = useState<CampaignTab>("active");
  const [search, setSearch] = useState("");

  const { data, loading, error, retry } = useAsyncData(
    () => getDealerCampaigns(tab),
    [tab],
  );

  const campaigns = useMemo(
    () =>
      data?.campaigns.filter((campaign) => matchesSearch(search, ...campaignSearchText(campaign))) ??
      [],
    [data, search],
  );

  return (
    <AppShell title="Campaigns">
      <SearchBar value={search} onChange={setSearch} placeholder="Search campaigns…" />

      <div className="mt-4 flex gap-2 rounded-2xl bg-secondary p-1">
        {campaignTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "press flex-1 rounded-xl py-2.5 text-sm font-bold",
              tab === t.id ? "bg-card shadow-soft" : "text-muted-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="mt-5"><PageSkeleton rows={3} /></div>}
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
                ? "No campaigns match your search."
                : `No ${tab} campaigns right now.`}
            </p>
          ) : (
            campaigns.map((campaign, i) => (
              <DealerCampaignCard key={campaign.id} campaign={campaign} tab={tab} index={i} />
            ))
          )}
        </div>
      )}

      <div className="mt-8 space-y-2">
        <p className="font-display font-bold">More</p>
        <Link
          to="/complaints"
          className="press flex items-center gap-4 rounded-3xl border border-border bg-card p-4 shadow-soft"
        >
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-secondary">
            <MessageSquareWarning className="h-5 w-5 text-primary" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Help Requests</p>
            <p className="text-sm text-muted-foreground">Track complaints & support</p>
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
            <p className="font-semibold">My Profile</p>
            <p className="text-sm text-muted-foreground">Account details & sign out</p>
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
  const hasProductPricing = Boolean(campaign.productId && campaign.discountPercent);
  const product = campaign.productId ? getProduct(campaign.productId) : null;
  const campaignPrice =
    product && campaign.discountPercent
      ? getCampaignPrice(product.price, campaign.discountPercent)
      : null;
  const hasVolumeGoal = Boolean(campaign.target && campaign.target > 0);
  const pct =
    hasVolumeGoal && campaign.target
      ? ((campaign.done ?? 0) / campaign.target) * 100
      : 0;

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
          <p className="mt-1 text-sm font-semibold opacity-90">Product: {campaign.productName}</p>
        )}
        <p className="mt-2 text-sm font-bold">
          {campaign.badgeLabel ??
            (campaign.discountPercent
              ? `${campaign.discountPercent}% campaign discount`
              : "Campaign offer")}
        </p>
      </div>
      <div className="p-5">
        {hasProductPricing && product && campaignPrice != null && (
          <CampaignPriceBlock
            mrp={product.mrp}
            dealerPrice={product.price}
            campaignPrice={campaignPrice}
          />
        )}
        <p className="mt-4 text-sm text-muted-foreground">{campaign.description}</p>
        {hasVolumeGoal && tab === "active" && (
          <>
            <ProgressBar value={pct} className="mt-4" />
            <div className="mt-2 flex items-center justify-between text-sm font-semibold">
              <span>
                {campaign.done ?? 0} / {campaign.target}
              </span>
              <span className="text-muted-foreground">
                {Math.max(0, (campaign.target ?? 0) - (campaign.done ?? 0))} more to go!
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
            Order {campaign.productName ?? "product"}
          </Link>
        )}
        {tab !== "expired" && !campaign.productId && (
          <Link
            to="/products"
            className="press mt-4 block rounded-2xl border border-border bg-secondary py-3.5 text-center text-base font-bold"
          >
            {tab === "upcoming" ? "View Products" : "Start Selling"}
          </Link>
        )}
      </div>
    </section>
  );
}
