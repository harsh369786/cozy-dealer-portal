/** Client preview of the server rule: Distributor Price = round(Dealer Price / (1 + margin/100)). */
export function calculateDistributorPrice(dealerPrice: number, marginPercent: number): number {
  const dealer = Math.max(0, Number(dealerPrice) || 0);
  const margin = Number(marginPercent);
  if (!Number.isFinite(margin) || margin <= -100) return 0;
  return Math.round(dealer / (1 + margin / 100));
}

/** Client preview of the server rule: Dealer Price = round(MRP × (1 − dealerMargin%/100)). */
export function calculateDealerPrice(mrp: number, dealerMarginPercent: number): number {
  const base = Math.max(0, Number(mrp) || 0);
  const margin = Number(dealerMarginPercent) || 0;
  const clamped = Math.min(100, Math.max(0, margin));
  return Math.round(base * (1 - clamped / 100));
}
