export function getCampaignPrice(dealerPrice: number, discountPercent: number) {
  return Math.max(0, Math.round(dealerPrice * (1 - discountPercent / 100)));
}

// Reward points use the canonical dealer-price x10 rule (1 rupee = 10 points).
// Imported for use within this module and re-exported for existing importers (e.g. app.ts).
import { calculateRewardPoints } from "../../shared/reward-points";
export { calculateRewardPoints };

export type RewardEligibility = "dealer" | "distributor" | "both";

import { getActivePriceCampaignRow } from "./campaigns-public";
import { applyMattressPricing, assertMattressDimensions, pricingDimensions } from "./mattress-pricing";

export async function getActivePriceCampaign(
  db: D1Database,
  productId: string,
  options?: { campaignId?: string; at?: Date },
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
  },
) {
  const product = await db
    .prepare(`SELECT * FROM products WHERE id = ? AND deleted_at IS NULL AND active = 1`)
    .bind(input.productId)
    .first<{
      id: string;
      name: string;
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

  const sized = applyMattressPricing(priceRow.mrp, priceRow.dealer_price, {
    lengthIn: input.lengthIn,
    breadthIn: input.breadthIn,
    thickness: input.thickness,
  });
  const standardDims = pricingDimensions(input.lengthIn, input.breadthIn);

  const matchedCampaign = await getActivePriceCampaign(db, input.productId, {
    campaignId: input.campaignId,
  });
  const dealerPrice = sized.dealerPrice;
  const mrp = sized.mrp;
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
  const qty = Math.max(1, input.quantity);

  const rewardPercent = priceRow.reward_percent ?? 0;
  const pointsEarned = calculateRewardPoints(dealerPrice, rewardPercent, qty);

  return {
    productId: input.productId,
    productName: product.name,
    mrp,
    dealerPrice,
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
    freeItems: priceRow.free_items_label,
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
