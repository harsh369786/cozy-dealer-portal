import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/app-shell";
import { PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { requireRoles } from "@/lib/auth-guard";
import { formatCampaignDate } from "@/lib/campaign-service";
import { resolveAssetUrl } from "@/lib/asset-url";
import { getDealerCampaignById } from "@/services/campaigns";

export const Route = createFileRoute("/campaigns/$campaignId")({
  beforeLoad: () => requireRoles(["dealer"]),
  component: CampaignDetailPage,
});

function CampaignDetailPage() {
  const { t } = useTranslation();
  const { campaignId } = Route.useParams();
  const navigate = useNavigate();

  const { data, loading } = useAsyncData(async () => {
    return getDealerCampaignById(campaignId);
  }, [campaignId]);

  useEffect(() => {
    if (!loading && data?.productId) {
      navigate({
        to: "/products/$productId",
        params: { productId: data.productId },
        search: { campaignId: data.id },
        replace: true,
      });
    }
  }, [loading, data, navigate]);

  if (loading) {
    return (
      <AppShell title={t("dealer.campaigns.title")} back="/campaigns">
        <PageSkeleton rows={3} />
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell title={t("dealer.campaigns.title")} back="/campaigns">
        <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {t("dealer.campaigns.unavailable")}
        </p>
        <Link to="/campaigns" className="press mt-4 block text-center text-sm font-bold text-primary">
          {t("dealer.campaigns.viewAll")}
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell title={data.name} back="/campaigns">
      {data.imageUrl ? (
        <img src={resolveAssetUrl(data.imageUrl)} alt={data.name} className="h-40 w-full rounded-2xl object-cover" />
      ) : null}
      <div className="mt-4 rounded-3xl border border-border bg-card p-5 shadow-soft">
        <p className="font-display text-xl font-bold">{data.name}</p>
        {data.productName && (
          <p className="mt-1 text-sm text-muted-foreground">
            {t("dealer.campaigns.productLabel", { name: data.productName })}
          </p>
        )}
        <p className="mt-2 text-sm text-muted-foreground">{data.description}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          {formatCampaignDate(data.startDate)} – {formatCampaignDate(data.endDate)}
        </p>
        {data.productId && data.discountPercent ? (
          <Link
            to="/products/$productId"
            params={{ productId: data.productId }}
            search={{ campaignId: data.id }}
            className="press mt-5 block rounded-2xl brand-gradient py-4 text-center text-base font-bold text-primary-foreground"
          >
            {t("dealer.campaigns.orderNow")}
          </Link>
        ) : (
          <Link
            to="/products"
            className="press mt-5 block rounded-2xl brand-gradient py-4 text-center text-base font-bold text-primary-foreground"
          >
            {t("dealer.campaigns.browseProducts")}
          </Link>
        )}
      </div>
    </AppShell>
  );
}
