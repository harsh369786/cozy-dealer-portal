import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  Gift,
  Info,
  Minus,
  Plus,
  ShieldCheck,
  X,
  MessageCircle,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CampaignBadge, CampaignPriceBlock } from "@/components/campaign-price";
import { cn } from "@/lib/utils";
import { Confetti, ProgressBar } from "@/components/brand";
import {
  fetchActivePriceCampaign,
  formatCampaignDate,
  type PriceCampaign,
} from "@/lib/campaign-service";
import { requireRoles } from "@/lib/auth-guard";
import { useFormat } from "@/hooks/use-format";
import { useFormatApiError } from "@/lib/api-errors";
import i18n from "@/lib/i18n";
import { resolveAssetUrl } from "@/lib/asset-url";
import { getProductDetail } from "@/services/catalog";
import { createDealerOrder, getPriceQuote } from "@/services/orders";
import { recordOrderPlaced } from "@/lib/browser-notifications";
import { useDealerRewards } from "@/hooks/use-dealer-rewards";
import { computeDealerRewardsSummary } from "@/lib/dealer-rewards-summary";
import { PlacingOrderOverlay } from "@/components/shared/placing-order-overlay";
import {
  formatRequestedVsStandard,
  formatSizeLabel,
  getMattressDimensionError,
  MAX_MATTRESS_BREADTH_IN,
  MAX_MATTRESS_LENGTH_IN,
  MIN_MATTRESS_BREADTH_IN,
  MIN_MATTRESS_LENGTH_IN,
  mapToCeilStandardSize,
  parseDimensionInput,
  snapDimensionInput,
} from "@/lib/mattress-size";
import { formatFreeItemsDisplay } from "@/lib/free-items";
import { hasNoGuarantee } from "@/lib/demo-data";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";

type ProductDetail = {
  id: string;
  name: string;
  category: string;
  guarantee: string;
  fixed_size?: string;
  image_url?: string;
  thicknesses?: string[];
  mrp?: number;
  price?: number;
  points?: number;
  free?: string;
};

type PriceQuote = {
  mrp: number;
  dealerPrice: number;
  campaignPrice: number | null;
  discountPercent: number | null;
  unitPrice: number;
  lineTotal: number;
  pointsEarned: number;
  campaign: {
    id: string;
    name: string;
    badgeLabel: string | null;
    discountPercent: number;
    endAt: string;
  } | null;
  freeItems?: string | null;
};

export const Route = createFileRoute("/products/$productId")({
  validateSearch: (search: Record<string, unknown>) => ({
    campaignId: typeof search.campaignId === "string" ? search.campaignId : undefined,
  }),
  beforeLoad: () => requireRoles(["dealer"]),
  head: () => ({
    meta: [
      { title: i18n.t("dealer.meta.productDetailTitle") },
      {
        name: "description",
        content: i18n.t("dealer.meta.productDetailDescription"),
      },
      { property: "og:title", content: i18n.t("dealer.meta.productDetailTitle") },
      {
        property: "og:description",
        content: i18n.t("dealer.meta.productDetailDescription"),
      },
    ],
  }),
  component: Configurator,
});

type PermaCorners = { tl: boolean; tr: boolean; bl: boolean; br: boolean };

function translateMattressDimensionError(
  err: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (err === "Enter valid length and width") return t("validation.enterValidLengthWidth");
  const lengthMin = err.match(/^Length must be at least (\d+)"$/);
  if (lengthMin) return t("validation.lengthMin", { min: lengthMin[1] });
  const lengthMax = err.match(/^Length must be at most (\d+)"$/);
  if (lengthMax) return t("validation.lengthMax", { max: lengthMax[1] });
  const widthMin = err.match(/^Width must be at least (\d+)"$/);
  if (widthMin) return t("validation.widthMin", { min: widthMin[1] });
  const widthMax = err.match(/^Width must be at most (\d+)"$/);
  if (widthMax) return t("validation.widthMax", { max: widthMax[1] });
  return err;
}

function selectedCornerLabels(corners: PermaCorners, t: (key: string) => string) {
  const labels: string[] = [];
  if (corners.tl) labels.push(t("common.topLeft"));
  if (corners.tr) labels.push(t("common.topRight"));
  if (corners.bl) labels.push(t("common.bottomLeft"));
  if (corners.br) labels.push(t("common.bottomRight"));
  return labels;
}


function Configurator() {
  const { t } = useTranslation();
  const { formatCurrency, formatNumber } = useFormat();
  const formatApiError = useFormatApiError();
  const { productId } = useParams({ from: "/products/$productId" });
  const { campaignId } = Route.useSearch();

  const { data: product, loading: productLoading, error: productError, retry } = useAsyncData(
    () => getProductDetail(productId) as Promise<ProductDetail>,
    [productId],
  );

  const isPillow = product?.category === "Pillows";
  const isFoldable = product?.category === "Foldable";
  const isMattress = product ? !isPillow && !isFoldable : false;

  const [lengthInput, setLengthInput] = useState("");
  const [breadthInput, setBreadthInput] = useState("");
  const length = parseDimensionInput(lengthInput);
  const breadth = parseDimensionInput(breadthInput);
  const mapped = useMemo(
    () => (isMattress ? mapToCeilStandardSize(length, breadth) : null),
    [isMattress, length, breadth],
  );
  const sizeDisplay = mapped
    ? formatRequestedVsStandard(length, breadth, mapped)
    : { requested: "", standard: null as string | null };

  const [thickness, setThickness] = useState("");
  const [perma, setPerma] = useState(false);
  const [permaCorners, setPermaCorners] = useState<PermaCorners>({
    tl: false,
    tr: false,
    bl: false,
    br: false,
  });
  const [permaNotes, setPermaNotes] = useState("");
  const [qty, setQty] = useState(1);
  const [placedBy, setPlacedBy] = useState("");
  const [placing, setPlacing] = useState(false);
  const [notes, setNotes] = useState("");
  const [customer, setCustomer] = useState({ name: "", address: "", mobile: "", email: "" });
  const [showCustomer, setShowCustomer] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [placed, setPlaced] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<PriceCampaign | null>(null);
  const [quote, setQuote] = useState<PriceQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const { summary: rewardsSummary } = useDealerRewards();

  useEffect(() => {
    if (!productId) return;
    fetchActivePriceCampaign(productId, campaignId)
      .then(setCampaign)
      .catch(() => setCampaign(null));
  }, [productId, campaignId]);

  useEffect(() => {
    if (!product) return;
    const thicknesses = product.thicknesses ?? [];
    if (thicknesses.length && !thickness) {
      setThickness(thicknesses[0]!);
    }
  }, [product, thickness]);

  const showPrice = isPillow || Boolean(thickness);
  const dimensionError = isMattress ? getMattressDimensionError(length, breadth) : null;
  const canQuote = Boolean(
    product && showPrice && (!isMattress || (length > 0 && breadth > 0 && !dimensionError)),
  );

  useEffect(() => {
    if (!canQuote || !product) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    setQuoteLoading(true);
    getPriceQuote({
      productId: product.id,
      quantity: qty,
      thickness: thickness || undefined,
      campaignId: campaignId ?? campaign?.id,
      lengthIn: isMattress ? (mapped?.standardLength ?? length) : undefined,
      breadthIn: isMattress ? (mapped?.standardBreadth ?? breadth) : undefined,
      // Raw entered width for width-based free-item rules (pricing snaps breadthIn; free items use
      // the raw width so 59.99" stays in the "< 60" bucket).
      freeItemWidthIn: isMattress ? breadth : undefined,
    })
      .then((res) => {
        if (!cancelled) setQuote(res as PriceQuote);
      })
      .catch(() => {
        if (!cancelled) setQuote(null);
      })
      .finally(() => {
        if (!cancelled) setQuoteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canQuote, product, qty, thickness, campaignId, campaign?.id, length, breadth, isMattress]);

  const unitDealerPrice = quote?.dealerPrice ?? product?.price ?? 0;
  // Only honor a campaign price when it actually reduces the dealer price, so a 0%
  // (or non-discounting) campaign never strikes through the price or shows "0% off".
  const rawUnitCampaignPrice = quote?.campaignPrice ?? null;
  const unitCampaignPrice =
    rawUnitCampaignPrice != null && rawUnitCampaignPrice < unitDealerPrice
      ? rawUnitCampaignPrice
      : null;
  const unitPrice = unitCampaignPrice ?? unitDealerPrice;
  const unitSavings = unitCampaignPrice != null ? unitDealerPrice - unitCampaignPrice : 0;

  const total = quote?.lineTotal ?? unitPrice * qty;
  const mrpTotal = (quote?.mrp ?? product?.mrp ?? 0) * qty;
  const dealerTotal = unitDealerPrice * qty;
  const savingsTotal = unitSavings * qty;
  const points = quote?.pointsEarned ?? (product?.points ?? 0) * qty;
  const rewardsNow = rewardsSummary;
  const rewardsAfterOrder =
    rewardsNow && points > 0
      ? computeDealerRewardsSummary(
          rewardsNow.balance,
          rewardsNow.nextRewardAt,
          rewardsNow.catalog,
          rewardsNow.balance + points,
        )
      : rewardsNow;
  const pointsRemainingAfterOrder = rewardsAfterOrder?.remaining ?? 0;
  const progressAfterOrderPct = rewardsAfterOrder?.pct ?? 0;

  const standardLength = mapped?.standardLength ?? length;
  const standardBreadth = mapped?.standardBreadth ?? breadth;
  const sizeLabel = isPillow
    ? product?.fixed_size ?? ""
    : formatSizeLabel(standardLength, standardBreadth, thickness || undefined);

  const placeOrder = async () => {
    if (!product) return;
    if (!placedBy.trim()) {
      toast.error(t("errors.orderPlacedByRequired"));
      return;
    }
    if (isMattress) {
      const err = getMattressDimensionError(length, breadth);
      if (err) {
        toast.error(translateMattressDimensionError(err, t));
        return;
      }
    }
    setPlacing(true);
    try {
      const cornerLabels = selectedCornerLabels(permaCorners, t);
      const order = await createDealerOrder({
        productId: product.id,
        quantity: qty,
        thickness: thickness || undefined,
        lengthIn: isMattress ? mapped!.standardLength : undefined,
        breadthIn: isMattress ? mapped!.standardBreadth : undefined,
        // Raw entered width so width-based free items match the actual ordered width.
        freeItemWidthIn: isMattress ? breadth : undefined,
        campaignId: quote?.campaign?.id ?? campaignId ?? campaign?.id,
        sizeRequested: isMattress ? `${length}" × ${breadth}"` : undefined,
        sizeStandard:
          isMattress && mapped
            ? `${mapped.standardLength}" × ${mapped.standardBreadth}"`
            : undefined,
        perma: isMattress ? perma : undefined,
        permaCorners: perma && cornerLabels.length ? JSON.stringify(permaCorners) : undefined,
        permaNotes: perma ? permaNotes : undefined,
        customerName: customer.name || undefined,
        customerPhone: customer.mobile || undefined,
        customerAddress: customer.address || undefined,
        customerEmail: customer.email || undefined,
        notes:
          [`Order placed by: ${placedBy.trim()}`, notes.trim() || null]
            .filter(Boolean)
            .join("\n\n") || undefined,
      });
      setPlaced(order.id);
      setConfirm(false);
      recordOrderPlaced();
      toast.success(t("common.orderPlacedSuccess"), {
        description: t("common.whatsappConfirmation"),
      });
    } catch (error) {
      toast.error(formatApiError(error, "common.couldNotPlaceOrder"));
    } finally {
      setPlacing(false);
    }
  };

  if (productLoading && !product) {
    return (
      <AppShell title={t("dealer.productDetail.title")} back="/products">
        <PageSkeleton rows={5} />
      </AppShell>
    );
  }

  if (productError || !product) {
    return (
      <AppShell title={t("dealer.productDetail.title")} back="/products">
        <ErrorState message={productError ?? t("common.productNotFound")} onRetry={retry} />
      </AppShell>
    );
  }

  const thicknesses = product.thicknesses ?? [];
  const activeCampaign = campaign ?? (quote?.campaign
    ? {
        id: quote.campaign.id,
        productId: product.id,
        name: quote.campaign.name,
        discountPercent: quote.campaign.discountPercent,
        startAt: "",
        endAt: quote.campaign.endAt,
        badgeLabel: quote.campaign.badgeLabel ?? t("dealer.productDetail.campaignBadgeDefault"),
        description: "",
      }
    : null);

  return (
    <AppShell title={product.name} back="/products">
      {activeCampaign && (
        <CampaignBadge label={activeCampaign.badgeLabel ?? t("common.specialOffer")} />
      )}

      {!isPillow && (
        <p className="animate-rise flex gap-2 rounded-2xl border border-primary/30 bg-secondary p-4 text-sm font-bold">
          <Info className="h-5 w-5 shrink-0 text-primary" />
          {t("common.sizeHint")}
        </p>
      )}

      <div className="mt-4 flex gap-3 rounded-3xl border border-border bg-card p-3 shadow-soft">
        <img
          src={resolveAssetUrl(product.image_url ?? "")}
          alt={product.name}
          width={400}
          height={400}
          className="h-20 w-20 rounded-2xl object-cover"
        />
        <div className="flex-1">
          <p className="font-display text-lg font-bold">{product.name}</p>
          {!hasNoGuarantee(product.guarantee) && (
            <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              {product.guarantee} {t("common.guarantee")}
            </p>
          )}
          {showPrice && quote && !quoteLoading ? (
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{t("common.mrp")}</span>
                <span>{formatCurrency((quote.mrp ?? product.mrp ?? 0) * qty)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className={cn(unitCampaignPrice != null && "text-muted-foreground")}>
                  {t("common.dealerPrice")}
                </span>
                <span
                  className={cn(
                    "font-semibold",
                    unitCampaignPrice != null && "text-muted-foreground line-through",
                  )}
                >
                  {formatCurrency(dealerTotal)}
                </span>
              </div>
              {unitCampaignPrice != null && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{t("common.campaignDiscount")}</span>
                    <span className="font-semibold text-primary">
                      {quote.discountPercent ?? activeCampaign?.discountPercent ?? 0}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">{t("common.finalDiscountedPrice")}</span>
                    <span className="font-display text-xl font-bold text-primary">{formatCurrency(total)}</span>
                  </div>
                </>
              )}
              {unitCampaignPrice == null && (
                <p className="font-display text-xl font-bold text-primary">{formatCurrency(dealerTotal)}</p>
              )}
            </div>
          ) : showPrice ? (
            quoteLoading ? (
              <p className="text-sm font-semibold text-muted-foreground">{t("common.calculatingPrice")}</p>
            ) : (
              <p className="font-display text-xl font-bold text-primary">{formatCurrency(unitDealerPrice)}</p>
            )
          ) : (
            <p className="text-sm font-semibold text-muted-foreground">{t("common.selectThicknessForPrice")}</p>
          )}
          {activeCampaign && (
            <p className="mt-1 text-xs font-semibold text-primary">
              {t("common.validUntil")} {formatCampaignDate(activeCampaign.endAt)}
            </p>
          )}
        </div>
      </div>

      {isPillow ? (
        <div className="mt-5 rounded-3xl border border-border bg-card p-4">
          <p className="text-base font-bold">{t("common.size")}</p>
          <p className="mt-1 font-display text-2xl font-bold">{product.fixed_size}</p>
        </div>
      ) : isFoldable ? (
        <>
          <div className="mt-5 rounded-3xl border border-border bg-card p-4">
            <p className="text-base font-bold">{t("common.size")}</p>
            <p className="mt-1 font-display text-2xl font-bold">{product.fixed_size}</p>
          </div>
          <div className="mt-5">
            <p className="text-base font-bold">{t("common.thickness")}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {thicknesses.map((t) => (
                <button
                  key={t}
                  onClick={() => setThickness(t)}
                  className={cn(
                    "press min-w-[4.5rem] flex-1 rounded-2xl border py-4 text-base font-bold",
                    thickness === t
                      ? "border-transparent brand-gradient text-primary-foreground"
                      : "border-border bg-card",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div>
              <p className="text-base font-bold">{t("common.lengthInches")}</p>
              <p className="text-xs text-muted-foreground">
                {t("common.lengthRange", {
                  min: MIN_MATTRESS_LENGTH_IN,
                  max: MAX_MATTRESS_LENGTH_IN,
                })}
              </p>
              <input
                inputMode="decimal"
                min={MIN_MATTRESS_LENGTH_IN}
                max={MAX_MATTRESS_LENGTH_IN}
                value={lengthInput}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d.]/g, "");
                  if ((v.match(/\./g) ?? []).length <= 1) setLengthInput(v);
                }}
                onBlur={() =>
                  // Keep the dealer's custom size; only snap to the nearest quarter inch.
                  // Do NOT ceil to a standard size here — that standardization is for
                  // pricing only (via `mapped`) and must not overwrite the entered size.
                  setLengthInput((v) => snapDimensionInput(v))
                }
                placeholder={t("common.lengthPlaceholder")}
                className="mt-2 h-14 w-full rounded-2xl border border-input bg-card px-4 text-center text-lg font-bold outline-none focus:border-ring"
              />
            </div>
            <div>
              <p className="text-base font-bold">{t("common.widthInches")}</p>
              <p className="text-xs text-muted-foreground">
                {t("common.widthRange", {
                  min: MIN_MATTRESS_BREADTH_IN,
                  max: MAX_MATTRESS_BREADTH_IN,
                })}
              </p>
              <input
                inputMode="decimal"
                min={MIN_MATTRESS_BREADTH_IN}
                max={MAX_MATTRESS_BREADTH_IN}
                value={breadthInput}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d.]/g, "");
                  if ((v.match(/\./g) ?? []).length <= 1) setBreadthInput(v);
                }}
                onBlur={() =>
                  // Keep the dealer's custom size; only snap to the nearest quarter inch.
                  setBreadthInput((v) => snapDimensionInput(v))
                }
                placeholder={t("common.widthPlaceholder")}
                className="mt-2 h-14 w-full rounded-2xl border border-input bg-card px-4 text-center text-lg font-bold outline-none focus:border-ring"
              />
            </div>
          </div>

          {dimensionError && length > 0 && breadth > 0 && (
            <p className="mt-2 text-sm font-semibold text-destructive">
              {translateMattressDimensionError(dimensionError, t)}
            </p>
          )}

          {mapped && length > 0 && breadth > 0 && !dimensionError && (
            <div className="mt-3 rounded-2xl border border-primary/30 bg-secondary/60 px-4 py-3 text-sm">
              <p className="font-semibold text-muted-foreground">{t("common.yourSize")}</p>
              <p className="mt-1 font-display text-lg font-bold">{sizeDisplay.requested}</p>
              {sizeDisplay.standard && (
                <>
                  <p className="mt-2 font-semibold text-muted-foreground">
                    {t("common.standardSizeForPricing")}
                  </p>
                  <p className="mt-1 font-display text-base font-bold">{sizeDisplay.standard}</p>
                </>
              )}
            </div>
          )}

          <div className="mt-5">
            <p className="text-base font-bold">{t("common.thickness")}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {thicknesses.map((t) => (
                <button
                  key={t}
                  onClick={() => setThickness(t)}
                  className={cn(
                    "press min-w-[4.5rem] flex-1 rounded-2xl border py-4 text-base font-bold",
                    thickness === t
                      ? "border-transparent brand-gradient text-primary-foreground"
                      : "border-border bg-card",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <p className="text-base font-bold">{t("common.farma")}</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  onClick={() => setPerma(v)}
                  className={cn(
                    "press rounded-2xl border py-4 text-base font-bold",
                    perma === v
                      ? "border-transparent brand-gradient text-primary-foreground"
                      : "border-border bg-card",
                  )}
                >
                  {v ? t("common.yes") : t("common.no")}
                </button>
              ))}
            </div>
          </div>

          {perma && (
            <div className="animate-rise mt-4 space-y-4 rounded-3xl border border-border bg-card p-4">
              <p className="text-sm font-bold">{t("common.selectCornersForFarma")}</p>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ["tl", "common.topLeft"],
                    ["tr", "common.topRight"],
                    ["bl", "common.bottomLeft"],
                    ["br", "common.bottomRight"],
                  ] as const
                ).map(([key, labelKey]) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-secondary/40 px-3 py-3"
                  >
                    <Checkbox
                      checked={permaCorners[key]}
                      onCheckedChange={(checked) =>
                        setPermaCorners((prev) => ({ ...prev, [key]: checked === true }))
                      }
                    />
                    <span className="text-sm font-semibold">{t(labelKey)}</span>
                  </label>
                ))}
              </div>
              <div>
                <p className="text-sm font-bold">{t("common.farmaNotes")}</p>
                <Textarea
                  value={permaNotes}
                  onChange={(e) => setPermaNotes(e.target.value)}
                  placeholder={t("common.farmaNotesPlaceholder")}
                  className="mt-2 min-h-24 rounded-2xl text-base"
                />
              </div>
            </div>
          )}
        </>
      )}

      <div className="mt-5">
        <p className="text-base font-bold">{t("common.quantity")}</p>
        <div className="mt-3 flex items-center justify-between rounded-2xl border border-border bg-card p-2">
          <button
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            aria-label={t("common.reduceQuantity")}
            className="press grid h-14 w-14 place-items-center rounded-xl bg-secondary"
          >
            <Minus className="h-6 w-6" />
          </button>
          <span className="font-display text-3xl font-bold">{qty}</span>
          <button
            onClick={() => setQty((q) => q + 1)}
            aria-label={t("common.increaseQuantity")}
            className="press grid h-14 w-14 place-items-center rounded-xl bg-secondary"
          >
            <Plus className="h-6 w-6" />
          </button>
        </div>
      </div>

      {formatFreeItemsDisplay(quote?.freeItems || product.free) && (
        <div className="mt-5 rounded-3xl border-2 border-primary/40 bg-secondary p-4">
          <p className="font-display text-base font-bold">{t("common.freeWithMattress")}</p>
          <div className="mt-3 flex items-center gap-3">
            <span className="rounded-lg brand-gradient px-2.5 py-1 text-xs font-bold text-primary-foreground">
              {t("common.free")}
            </span>
            <div>
              <p className="text-base font-bold">
                {formatFreeItemsDisplay(quote?.freeItems || product.free)}
              </p>
            </div>
          </div>
        </div>
      )}

      {showPrice && quote ? (
        <div className="mt-5 rounded-3xl border border-border surface-gradient p-5">
          <CampaignPriceBlock
            mrp={quote.mrp}
            dealerPrice={quote.dealerPrice}
            campaignPrice={quote.campaignPrice ?? undefined}
            discountPercent={quote.discountPercent}
            qty={qty}
          />
          <p className="mt-2 text-center text-sm font-semibold text-muted-foreground">{sizeLabel}</p>
          <p className="mt-3 rounded-2xl bg-card/70 px-4 py-3 text-sm font-bold">
            {t("common.youllEarnPoints", { points })}
          </p>
        </div>
      ) : showPrice ? (
        <p className="mt-5 text-center text-sm text-muted-foreground">{t("common.updatingPrice")}</p>
      ) : (
        <p className="mt-5 rounded-2xl border border-dashed border-border bg-secondary/40 px-4 py-4 text-center text-sm font-semibold text-muted-foreground">
          {t("common.selectThicknessToSeePrice")}
        </p>
      )}

      <div className="mt-5">
        <p className="text-base font-bold">
          {t("common.orderPlacedBy")} <span className="text-destructive">*</span>
        </p>
        <Field
          label=""
          value={placedBy}
          onChange={setPlacedBy}
          placeholder={t("common.personNamePlaceholder")}
        />
      </div>

      <div className="mt-5 rounded-3xl border border-border bg-card">
        <button
          onClick={() => setShowCustomer((s) => !s)}
          className="press flex w-full items-center justify-between px-4 py-4"
        >
          <span className="text-base font-bold">
            {t("common.customerDetails")}{" "}
            <span className="text-xs font-semibold text-muted-foreground">{t("common.optional")}</span>
          </span>
          <ChevronDown
            className={cn("h-5 w-5 transition-transform", showCustomer && "rotate-180")}
          />
        </button>
        {showCustomer && (
          <div className="animate-rise space-y-3 px-4 pb-4">
            <Field
              label={t("common.name")}
              value={customer.name}
              onChange={(v) => setCustomer({ ...customer, name: v })}
            />
            <Field
              label={t("common.address")}
              value={customer.address}
              onChange={(v) => setCustomer({ ...customer, address: v })}
            />
            <Field
              label={t("common.mobile")}
              value={customer.mobile}
              onChange={(v) => setCustomer({ ...customer, mobile: v })}
              inputMode="numeric"
            />
            <Field
              label={t("common.email")}
              value={customer.email}
              onChange={(v) => setCustomer({ ...customer, email: v })}
            />
          </div>
        )}
      </div>

      <div className="mt-5">
        <p className="text-base font-bold">
          {t("common.specialRequirements")}{" "}
          <span className="text-xs font-semibold text-muted-foreground">{t("common.optional")}</span>
        </p>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("common.specialRequirementsPlaceholder")}
          className="mt-3 min-h-28 rounded-2xl border-input text-base"
        />
      </div>

      <button
        onClick={() => setConfirm(true)}
        disabled={!showPrice || !quote || quoteLoading}
        className={cn(
          "press mt-6 h-16 w-full rounded-2xl text-lg font-bold text-primary-foreground",
          showPrice ? "brand-gradient" : "bg-muted text-muted-foreground",
        )}
      >
        {t("common.reviewOrder")}
      </button>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/50 p-0 backdrop-blur-sm">
          <div className="scrollbar-none animate-rise max-h-[88vh] w-full max-w-[430px] overflow-y-auto scroll-smooth-touch rounded-t-3xl border border-border bg-card p-5 md:max-w-[520px]">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-bold">{t("common.confirmOrder")}</h3>
              <button
                onClick={() => !placing && setConfirm(false)}
                disabled={placing}
                aria-label={t("common.close")}
                className="press grid h-10 w-10 place-items-center rounded-full bg-secondary disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 divide-y divide-border rounded-2xl border border-border">
              <Line label={t("common.model")} value={product.name} />
              {!hasNoGuarantee(product.guarantee) && (
                <Line label={t("common.guarantee")} value={product.guarantee} />
              )}
              {isPillow ? (
                <Line label={t("common.size")} value={product.fixed_size!} />
              ) : isFoldable ? (
                <>
                  <Line label={t("common.size")} value={product.fixed_size!} />
                  <Line label={t("common.thickness")} value={thickness} />
                </>
              ) : (
                <>
                  <Line label={t("common.requested")} value={sizeDisplay.requested} />
                  {sizeDisplay.standard && (
                    <Line label={t("common.standardSize")} value={sizeDisplay.standard} />
                  )}
                  <Line label={t("common.thickness")} value={thickness} />
                  <Line label={t("common.farma")} value={perma ? t("common.yes") : t("common.no")} />
                  {perma && selectedCornerLabels(permaCorners, t).length > 0 && (
                    <Line
                      label={t("common.farmaCorners")}
                      value={selectedCornerLabels(permaCorners, t).join(", ")}
                    />
                  )}
                  {perma && permaNotes && <Line label={t("common.farmaNotes")} value={permaNotes} />}
                </>
              )}
              <Line label={t("common.quantity")} value={String(qty)} />
              <Line label={t("common.mrp")} value={formatCurrency(mrpTotal)} />
              <Line
                label={t("common.dealerPrice")}
                value={formatCurrency(dealerTotal)}
                muted={unitCampaignPrice != null}
              />
              {unitCampaignPrice != null && (
                <>
                  <Line
                    label={t("common.campaignDiscount")}
                    value={`${quote?.discountPercent ?? activeCampaign?.discountPercent ?? 0}%`}
                  />
                  <Line label={t("common.finalDiscountedPrice")} value={formatCurrency(total)} strong />
                  <Line label={t("common.youSave")} value={formatCurrency(savingsTotal)} strong />
                </>
              )}
              {formatFreeItemsDisplay(quote?.freeItems || product.free) && (
                <Line
                  label={t("common.freeItems")}
                  value={formatFreeItemsDisplay(quote?.freeItems || product.free)}
                />
              )}
              <Line label={t("dealer.orders.rewardPointsLabel")} value={`+${points}`} strong />
              <Line
                label={t("common.pointsRemaining")}
                value={String(pointsRemainingAfterOrder)}
              />
              <Line label={t("common.orderPlacedBy")} value={placedBy.trim()} />
              {notes && <Line label={t("common.specialRequirementsShort")} value={notes} />}
              {customer.name && <Line label={t("common.customer")} value={customer.name} />}
              {customer.mobile && <Line label={t("common.mobile")} value={customer.mobile} />}
              {customer.address && <Line label={t("common.address")} value={customer.address} />}
              {customer.email && <Line label={t("common.email")} value={customer.email} />}
            </div>

            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <MessageCircle className="h-4 w-4" /> {t("common.whatsappOrderDetails")}
            </p>

            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setConfirm(false)}
                disabled={placing}
                className="press h-14 flex-1 rounded-2xl border border-border bg-background text-base font-bold disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => void placeOrder()}
                disabled={placing}
                className="press h-14 flex-[1.4] rounded-2xl brand-gradient text-base font-bold text-primary-foreground disabled:opacity-50"
              >
                {t("common.placeOrder")}
              </button>
            </div>
          </div>
        </div>
      )}

      {placing && <PlacingOrderOverlay />}

      {placed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-5 backdrop-blur-sm">
          <div className="animate-pop relative w-full max-w-[430px] overflow-hidden rounded-3xl border border-border bg-card p-6 text-center shadow-lift md:max-w-[520px]">
            <Confetti />
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full brand-gradient">
              <Check className="h-10 w-10 text-primary-foreground" strokeWidth={3} />
            </div>
            <h2 className="animate-rise mt-5 font-display text-2xl font-bold">
              {t("common.orderPlacedSuccessTitle")}
            </h2>
            <p className="mt-3 font-display text-xl font-bold">
              {t("common.orderNumberLabel")}: {placed}
            </p>
            <p className="mt-2 text-base font-bold text-primary">
              {t("common.rewardPointsEarned")}: {points}
            </p>

            {activeCampaign && savingsTotal > 0 && (
              <div className="mt-4 rounded-2xl border border-primary/30 bg-secondary px-4 py-3">
                <p className="text-sm font-bold text-primary">{t("common.campaignDiscountApplied")}</p>
                <p className="mt-1 font-display text-xl font-bold">
                  {t("common.youSaved", { amount: formatCurrency(savingsTotal) })}
                </p>
              </div>
            )}

            <div className="mt-5 rounded-2xl border border-border surface-gradient p-4 text-left">
              <ProgressBar value={progressAfterOrderPct} />
              <p className="mt-3 text-sm font-semibold">
                {pointsRemainingAfterOrder > 0
                  ? t("common.pointsRemainingForReward", {
                      count: formatNumber(pointsRemainingAfterOrder),
                    })
                  : t("common.rewardUnlocked")}
              </p>
            </div>

            <p className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-secondary px-4 py-3 text-sm font-bold text-success">
              <MessageCircle className="h-4 w-4" /> {t("common.whatsappConfirmationSent")}
            </p>

            <Link
              to="/orders"
              className="press mt-5 block rounded-2xl brand-gradient px-8 py-4 text-lg font-bold text-primary-foreground"
            >
              {t("common.viewOrder")}
            </Link>
            <Link to="/home" className="mt-3 block text-sm font-bold text-muted-foreground">
              {t("common.backToHome")}
            </Link>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Field({
  label,
  value,
  onChange,
  inputMode,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: "numeric" | "text";
  placeholder?: string;
}) {
  const { t } = useTranslation();

  return (
    <label className="block">
      {label ? (
        <span className="text-xs font-semibold text-muted-foreground">
          {label} · {t("common.optional")}
        </span>
      ) : null}
      <input
        value={value}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-14 w-full rounded-2xl border border-input bg-background px-4 text-base outline-none focus:border-ring",
          label ? "mt-1" : "mt-3",
        )}
      />
    </label>
  );
}

function Line({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-right font-semibold",
          strong && "font-display text-base font-bold text-primary",
          muted && "text-muted-foreground line-through",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export { Gift };
