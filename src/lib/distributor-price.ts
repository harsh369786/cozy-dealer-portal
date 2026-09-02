/** Client preview of the server rule: Distributor Price = round(Dealer Price / (1 + margin/100)). */
export function calculateDistributorPrice(dealerPrice: number, marginPercent: number): number {
  const dealer = Math.max(0, Number(dealerPrice) || 0);
  const margin = Number(marginPercent);
  if (!Number.isFinite(margin) || margin <= -100) return 0;
  return Math.round(dealer / (1 + margin / 100));
}
