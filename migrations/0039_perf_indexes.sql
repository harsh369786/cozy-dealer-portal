-- Performance indexes for the dealer home / dashboard hot path. ADD-only (CREATE INDEX IF NOT
-- EXISTS) — no table rebuilds, safe on populated D1.
--
-- Why:
--  * loadDealerStats (api/services/dealers.ts) runs several correlated subqueries over `orders`
--    all filtered by `dealer_id` + `deleted_at IS NULL` + `status NOT IN (...)`. A single-column
--    idx_orders_dealer already exists, but a composite (dealer_id, deleted_at, status) lets SQLite
--    satisfy the dealer-scoped, non-deleted, status-filtered scans from the index.
--  * The reward-points subquery sums `points_ledger` by `dealer_id`, but points_ledger had NO index
--    on dealer_id (only its PK on id) — every dealer stats load did a full scan of the ledger.

CREATE INDEX IF NOT EXISTS idx_points_ledger_dealer ON points_ledger(dealer_id);
CREATE INDEX IF NOT EXISTS idx_orders_dealer_deleted_status ON orders(dealer_id, deleted_at, status);
