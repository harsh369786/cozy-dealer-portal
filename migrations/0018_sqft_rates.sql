-- Square-foot catalog pricing keyed by guarantee + thickness
CREATE TABLE IF NOT EXISTS mattress_sqft_rates (
  guarantee TEXT NOT NULL,
  thickness TEXT NOT NULL,
  mrp_per_sqft REAL NOT NULL,
  dealer_per_sqft REAL NOT NULL,
  reward_percent REAL NOT NULL DEFAULT 0,
  effective_from TEXT NOT NULL,
  PRIMARY KEY (guarantee, thickness)
);
