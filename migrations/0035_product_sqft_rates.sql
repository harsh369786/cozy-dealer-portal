-- Per-product, per-thickness MRP square-foot rate for mattresses.
--
-- Each mattress model defines an MRP ₹/sqft for each of its thicknesses. At order time the MRP is
-- computed from the SNAPPED standard size (existing 1" buffer logic):
--   areaSqft = (snappedLength/12) * (snappedWidth/12)
--   mrp      = round(mrp_per_sqft * areaSqft)
-- Dealer and distributor prices are then derived from this MRP via the existing pricing-tier
-- margins (Dealer = MRP*(1-dealerMargin%), Distributor = Dealer/(1+distributorMargin%)).
--
-- Distinct from the legacy guarantee-keyed `mattress_sqft_rates` (0018), a one-shot catalog
-- generator that bakes product_prices and is NOT read at runtime. This table IS read at runtime.
--
-- ADD-only. Mattress sqft rates are compulsory: a mattress cannot be active / shown to dealers
-- unless it has a rate for every thickness (enforced in application code, not the schema).
CREATE TABLE IF NOT EXISTS product_sqft_rates (
  product_id TEXT NOT NULL REFERENCES products(id),
  thickness TEXT NOT NULL,
  mrp_per_sqft REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (product_id, thickness)
);
