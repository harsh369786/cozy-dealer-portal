export function getCampaignPrice(dealerPrice: number, discountPercent: number) {
  return Math.max(0, Math.round(dealerPrice * (1 - discountPercent / 100)));
}

// Reward points use the canonical dealer-price x10 rule (1 rupee = 10 points).
// Imported for use within this module and re-exported for existing importers (e.g. app.ts).
import { calculateRewardPoints } from "../../shared/reward-points";
export { calculateRewardPoints };
import { resolveFreeItemsForWidth } from "../../shared/free-item-rules";

export type RewardEligibility = "dealer" | "distributor" | "both";

import { getActivePriceCampaignRow } from "./campaigns-public";
import { assertPositiveInt } from "../utils";
import {
  applyMattressPricing,
  applySqftMrp,
  assertMattressDimensions,
  pricingDimensions,
} from "./mattress-pricing";
import { getProductSqftRate, isMattressCategory, minSqftRateFor } from "./product-sqft-rates";
import { BASE_MATTRESS_LENGTH, BASE_MATTRESS_BREADTH } from "./mattress-pricing";
import {
  calculateDealerPrice,
  calculateDistributorPrice,
  marginsFromContext,
  resolvePricingContext,
} from "./pricing-tiers";

export async function getActivePriceCampaign(
  db: D1Database,
  productId: string,
  options?: { campaignId?: string; at?: Date; distributorId?: string | null },
) {
  const row = await getActivePriceCampaignRow(db, productId, options);
  if (!row) return null;
  return row as {
      id: string;
      name: string;
      product_id: string;
      discount_percent: number;
      start_at: string;
      end_at: string;
      description: string;
      terms: string | null;
      badge_label: string | null;
    };
}

export async function buildPriceQuote(
  db: D1Database,
  input: {
    productId: string;
    quantity: number;
    thickness?: string;
    campaignId?: string;
    lengthIn?: number;
    breadthIn?: number;
    // DEPRECATED / IGNORED: previously the raw ordered width was used for width-based free-item
    // rules. Per current spec, freebies are evaluated on the SNAPPED standard width (same as pricing),
    // so this field no longer affects the result. Kept optional for backward-compatible callers.
    freeItemWidthIn?: number | null;
    // Pricing context: used to resolve the price list (tier) and its per-product margins.
    dealerId?: string | null;
    distributorId?: string | null;
    pricingTierId?: string | null;
  },
) {
  const product = await db
    .prepare(`SELECT * FROM products WHERE id = ? AND deleted_at IS NULL AND active = 1`)
    .bind(input.productId)
    .first<{
      id: string;
      name: string;
      category: string;
      mrp: number;
    }>();

  const priceRow = await db
    .prepare(
      `SELECT mrp, dealer_price, points, reward_percent, reward_eligibility, free_items_label FROM product_prices
       WHERE product_id = ? ORDER BY effective_from DESC LIMIT 1`,
    )
    .bind(input.productId)
    .first<{
      mrp: number;
      dealer_price: number;
      points: number;
      reward_percent: number | null;
      reward_eligibility: string | null;
      free_items_label: string | null;
    }>();

  if (!product || !priceRow) throw new Error("Product not found");

  assertMattressDimensions(input.lengthIn, input.breadthIn);

  // Scale the base MRP (72"x36") to the requested size/thickness. dealer_price is passed
  // only so the helper returns a scaled figure; the authoritative dealer price is derived
  // from MRP x (1 - dealerMargin%) below.
  const sized = applyMattressPricing(priceRow.mrp, priceRow.dealer_price, {
    lengthIn: input.lengthIn,
    breadthIn: input.breadthIn,
    thickness: input.thickness,
  });
  const standardDims = pricingDimensions(input.lengthIn, input.breadthIn);

  // Mattress square-foot MRP. A mattress (any product that isn't a pillow/foldable) is priced from
  // its per-thickness ₹/sqft rate on the SNAPPED standard size. The rate is compulsory: if a
  // mattress is ordered with a size + thickness but has no configured rate, we refuse to quote
  // rather than silently fall back. Pillows/foldables and mattress previews without a size keep the
  // base-price model.
  const isMattress = isMattressCategory(product.category);
  const wantsSqft = isMattress && !!input.lengthIn && !!input.breadthIn && !!input.thickness;
  let sqft: ReturnType<typeof applySqftMrp> = null;
  if (wantsSqft) {
    const mrpPerSqft = await getProductSqftRate(db, input.productId, input.thickness!);
    if (mrpPerSqft == null) {
      throw new Error("Mattress sq.ft price not set");
    }
    sqft = applySqftMrp(mrpPerSqft, {
      lengthIn: input.lengthIn,
      breadthIn: input.breadthIn,
    });
  }

  // MRP resolution:
  //  - Full sqft calc (mattress with size + thickness): use it.
  //  - Mattress WITHOUT a chosen size/thickness (catalog "from" preview): mattresses no longer
  //    store a manual MRP, so sized.mrp (from product_prices) is typically 0. Derive a "from"
  //    preview MRP from the cheapest configured ₹/sqft rate at the base 72"×36" size, so cards
  //    show a sensible starting price instead of ₹0.
  //  - Non-mattress: keep the base-price model (sized.mrp).
  let mrp = sqft ? sqft.mrp : sized.mrp;
  if (!sqft && isMattress && (!mrp || mrp <= 0)) {
    const minRate = await minSqftRateFor(db, input.productId);
    if (minRate != null) {
      const baseArea = (BASE_MATTRESS_LENGTH / 12) * (BASE_MATTRESS_BREADTH / 12);
      mrp = Math.round(minRate * baseArea);
    }
  }

  // Resolve the dealer's price list (tier) and its per-product margins.
  const ctx = await resolvePricingContext(db, {
    dealerId: input.dealerId,
    distributorId: input.distributorId,
    pricingTierId: input.pricingTierId,
  });
  const { dealerMarginPercent, distributorMarginPercent } = marginsFromContext(ctx, input.productId);

  // Dealer Price = MRP x (1 - dealerMargin%/100).
  //  - Sqft-priced mattress: ALWAYS derive dealer price from the sqft MRP via the tier margin
  //    (margin defaults to 0 when none configured -> dealer = MRP), so dealer/distributor are
  //    always wired to the sqft MRP.
  //  - Otherwise (legacy/base-price products): use the per-product margin when one exists, else
  //    fall back to the size-scaled stored dealer price so existing catalogs keep their prices.
  const marginDealerPrice = calculateDealerPrice(mrp, dealerMarginPercent);
  const dealerPrice = sqft
    ? marginDealerPrice
    : ctx && ctx.dealerMarginByProduct.has(input.productId)
      ? marginDealerPrice
      : sized.dealerPrice;

  // Distributor Price = Dealer Price / (1 + distributorMargin%/100), rounded half-up.
  const distributorPrice = calculateDistributorPrice(dealerPrice, distributorMarginPercent);

  // Resolve the effective distributor for campaign scoping so a dealer/distributor only ever sees
  // GLOBAL campaigns or ones targeted at their own distributor (no cross-bleed). When only a
  // dealerId is supplied, look up that dealer's distributor_id.
  let campaignDistributorId: string | null = input.distributorId ?? null;
  if (!campaignDistributorId && input.dealerId) {
    const dealerRow = await db
      .prepare(`SELECT distributor_id FROM dealers WHERE id = ? AND deleted_at IS NULL`)
      .bind(input.dealerId)
      .first<{ distributor_id: string | null }>();
    campaignDistributorId = dealerRow?.distributor_id ?? null;
  }

  const matchedCampaign = await getActivePriceCampaign(db, input.productId, {
    campaignId: input.campaignId,
    distributorId: campaignDistributorId,
  });
  const rawCampaignPrice = matchedCampaign
    ? getCampaignPrice(dealerPrice, matchedCampaign.discount_percent)
    : null;
  // Only treat it as a campaign when it actually reduces the dealer price. A 0%
  // (or otherwise non-discounting) campaign must not strike through the dealer
  // price or advertise a "0% off" offer.
  const hasRealDiscount = rawCampaignPrice != null && rawCampaignPrice < dealerPrice;
  const campaign = hasRealDiscount ? matchedCampaign : null;
  const campaignPrice = hasRealDiscount ? rawCampaignPrice : null;
  const unitPrice = campaignPrice ?? dealerPrice;
  // Reject garbage quantity (NaN / <=0 / non-integer / absurd) instead of silently coercing to 1.
  // This is the single choke point for both order-create and order-edit, so validating here covers
  // both paths. Throws a clean Error → the routes turn it into a 400.
  const qty = assertPositiveInt(input.quantity, "quantity");

  const rewardPercent = priceRow.reward_percent ?? 0;
  const pointsEarned = calculateRewardPoints(dealerPrice, rewardPercent, qty);

  return {
    productId: input.productId,
    productName: product.name,
    mrp,
    dealerPrice,
    dealerMarginPercent,
    distributorPrice,
    distributorMarginPercent,
    sizeFactor: sized.factor,
    campaignId: campaign?.id ?? null,
    campaignPrice,
    discountPercent: campaign?.discount_percent ?? null,
    unitPrice,
    quantity: qty,
    lineTotal: unitPrice * qty,
    pointsEarned,
    rewardPercent,
    standardLengthIn: standardDims.lengthIn ?? null,
    standardBreadthIn: standardDims.breadthIn ?? null,
    rewardEligibility: (priceRow.reward_eligibility ?? "dealer") as RewardEligibility,
    // Width-based free items: evaluate the configured rules against the SNAPPED STANDARD width — the
    // same size used for pricing — NOT the raw entered order size. Per spec, once an order size is
    // mapped to a standard pricing size, that standard size is the single reference for both pricing
    // and freebies (e.g. 71×59 -> 72×60, so freebies use 60"). The raw order size is retained/shown
    // only for manufacturing. Rows with no width condition always apply. When no width is known
    // (catalog "from" preview), resolveFreeItemsForWidth returns the full configured list unchanged.
    // Length is intentionally ignored. See shared/free-item-rules.ts.
    freeItems: resolveFreeItemsForWidth(
      priceRow.free_items_label,
      standardDims.breadthIn ?? input.breadthIn,
    ),
    campaign: campaign
      ? {
          id: campaign.id,
          name: campaign.name,
          badgeLabel: campaign.badge_label,
          discountPercent: campaign.discount_percent,
          description: campaign.description,
          terms: campaign.terms,
          startAt: campaign.start_at,
          endAt: campaign.end_at,
        }
      : null,
  };
}
