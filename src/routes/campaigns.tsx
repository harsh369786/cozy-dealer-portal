import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarDays, ChevronRight, MessageSquareWarning, User } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CampaignPriceBlock } from "@/components/campaign-price";
import { SearchBar, matchesSearch } from "@/components/shared/search-bar";
import { ProgressBar } from "@/components/brand";
import { requireRoles } from "@/lib/auth-guard";
import {
  formatCampaignDate,
  getActivePriceCampaign,
  getCampaignPrice,
} from "@/lib/campaign-service";
import { campaigns, getProduct, inr } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

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

function Campaigns() {
  const [tab, setTab] = useState<CampaignTab>("active");
  const [search, setSearch] = useState("");
  const priceCampaign = tab === "active" ? getActivePriceCampaign("latexo") : null;
  const latexo = getProduct("latexo");
  const campaignPrice = priceCampaign
    ? getCampaignPrice(latexo.price, priceCampaign.discountPercent)
    : null;

  const sellCampaigns = useMemo(
    () =>
      campaigns.filter(
        (c) =>
          c.status === tab &&
          matchesSearch(search, c.title, c.goal, c.description, c.reward),
      ),
    [tab, search],
  );

  const showPriceCampaign =
    priceCampaign &&
    campaignPrice &&
    matchesSearch(search, priceCampaign.name, latexo.name, priceCampaign.description, priceCampaign.badgeLabel);

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

      {showPriceCampaign && (
        <section className="animate-rise mt-5 overflow-hidden rounded-3xl border border-primary/30 bg-card shadow-lift">
          <div className="brand-gradient px-5 py-6 text-primary-foreground">
            <p className="text-3xl">🔥</p>
            <p className="mt-2 font-display text-xl font-bold">{priceCampaign.name}</p>
            <p className="mt-1 text-sm font-semibold opacity-90">Product: {latexo.name}</p>
            <p className="mt-2 text-sm font-bold">{priceCampaign.badgeLabel}</p>
          </div>
          <div className="p-5">
            <CampaignPriceBlock
              mrp={latexo.mrp}
              dealerPrice={latexo.price}
              campaignPrice={campaignPrice}
            />
            <p className="mt-4 text-sm text-muted-foreground">{priceCampaign.description}</p>
            <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              {formatCampaignDate(priceCampaign.startAt)} –{" "}
              {formatCampaignDate(priceCampaign.endAt)}
            </p>
            <Link
              to="/products/$productId"
              params={{ productId: "latexo" }}
              className="press mt-5 block rounded-2xl brand-gradient py-4 text-center text-base font-bold text-primary-foreground"
            >
              Order Latexo
            </Link>
          </div>
        </section>
      )}

      <h2 className="mb-3 mt-8 font-display text-lg font-bold">Sell & Earn Campaigns</h2>
      {sellCampaigns.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {search.trim()
            ? "No campaigns match your search."
            : `No ${tab} sell campaigns right now.`}
        </p>
      ) : (
        <div className="space-y-4">
          {sellCampaigns.map((c, i) => {
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
                  {tab === "active" && (
                    <>
                      <ProgressBar value={pct} className="mt-4" />
                      <div className="mt-2 flex items-center justify-between text-sm font-semibold">
                        <span>
                          {c.done} / {c.target}
                        </span>
                        <span className="text-muted-foreground">{c.target - c.done} more to go!</span>
                      </div>
                    </>
                  )}
                  <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarDays className="h-4 w-4" /> {c.starts} – {c.ends}
                  </p>
                  {tab !== "expired" && (
                    <Link
                      to="/products"
                      className="press mt-4 block rounded-2xl border border-border bg-secondary py-3.5 text-center text-base font-bold"
                    >
                      {tab === "upcoming" ? "View Products" : "Start Selling"}
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
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
