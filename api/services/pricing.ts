export function getCampaignPrice(dealerPrice: number, discountPercent: number) {
  return Math.round(dealerPrice * (1 - discountPercent / 100));
}

export function calculateRewardPoints(mrp: number, rewardPercent: number, quantity: number): number {
  return Math.round((mrp * rewardPercent) / 100) * Math.max(1, quantity);
}

export type RewardEligibility = "dealer" | "distributor" | "both";

export async function getActivePriceCampaign(db: D1Database, productId: string, at = new Date()) {
  const now = at.toISOString();
  return db
    .prepare(
      `SELECT * FROM price_campaigns
       WHERE product_id = ? AND deleted_at IS NULL
         AND start_at <= ? AND end_at >= ?
       ORDER BY start_at DESC LIMIT 1`,
    )
    .bind(productId, now, now)
    .first<{
      id: string;
      name: string;
      product_id: string;
      discount_percent: number;
      start_at: string;
      end_at: string;
      description: string;
      terms: string | null;
      badge_label: string | null;
    }>();
}

export async function buildPriceQuote(
  db: D1Database,
  input: {
    productId: string;
    quantity: number;
    thickness?: string;
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

  const campaign = await getActivePriceCampaign(db, input.productId);
  const dealerPrice = priceRow.dealer_price;
  const campaignPrice = campaign
    ? getCampaignPrice(dealerPrice, campaign.discount_percent)
    : null;
  const unitPrice = campaignPrice ?? dealerPrice;
  const qty = Math.max(1, input.quantity);

  const rewardPercent = priceRow.reward_percent ?? 0;
  const pointsEarned = calculateRewardPoints(priceRow.mrp, rewardPercent, qty);

  return {
    productId: input.productId,
    productName: product.name,
    mrp: priceRow.mrp,
    dealerPrice,
    campaignId: campaign?.id ?? null,
    campaignPrice,
    discountPercent: campaign?.discount_percent ?? null,
    unitPrice,
    quantity: qty,
    lineTotal: unitPrice * qty,
    pointsEarned,
    rewardPercent,
    rewardEligibility: (priceRow.reward_eligibility ?? "dealer") as RewardEligibility,
    freeItems: priceRow.free_items_label,
    campaign: campaign
      ? {
          id: campaign.id,
          name: campaign.name,
          badgeLabel: campaign.badge_label,
          discountPercent: campaign.discount_percent,
          startAt: campaign.start_at,
          endAt: campaign.end_at,
        }
      : null,
  };
}
