import { formatInLabel } from "../utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const CITY_STATE: Record<string, string> = {
  nagpur: "Maharashtra",
  pune: "Maharashtra",
  nashik: "Maharashtra",
  mumbai: "Maharashtra",
  thane: "Maharashtra",
  ahmedabad: "Gujarat",
  surat: "Gujarat",
  vadodara: "Gujarat",
  rajkot: "Gujarat",
  panaji: "Goa",
  goa: "Goa",
  bengaluru: "Karnataka",
  bangalore: "Karnataka",
  mysore: "Karnataka",
  hyderabad: "Telangana",
  kochi: "Kerala",
  cochin: "Kerala",
  indore: "Madhya Pradesh",
  bhopal: "Madhya Pradesh",
  coimbatore: "Tamil Nadu",
  chennai: "Tamil Nadu",
};

const STATE_NAMES = [
  "Maharashtra",
  "Gujarat",
  "Goa",
  "Karnataka",
  "Telangana",
  "Kerala",
  "Madhya Pradesh",
  "Tamil Nadu",
  "Rajasthan",
  "Delhi",
  "Uttar Pradesh",
  "West Bengal",
];

function sizeSqftExpr(col: string) {
  // Normalize every dimension separator variant to a single "×" so we can split on one char.
  // Handles: "×", " x ", " X ", bare "x"/"X", and "*". Order matters — collapse the spaced
  // forms first, then the bare letters, so "72 x 36" and "72x36" both become "72×36".
  const norm = `replace(replace(replace(replace(replace(COALESCE(${col}, ''),
    ' x ', '×'), ' X ', '×'), 'x', '×'), 'X', '×'), '*', '×')`;
  // CAST(... AS REAL) in SQLite skips leading whitespace and stops at the first non-numeric
  // char, so we do NOT need to strip inch marks (") or trailing junk — casting each side of
  // the "×" directly yields the number (e.g. CAST('72"' )=72, CAST(' 66"')=66). This makes the
  // area compute correctly whether or not the stored size has inch marks or spaces.
  return `CASE
    WHEN instr(${norm}, '×') > 1 THEN
      (
        CAST(replace(substr(${norm}, 1, instr(${norm}, '×') - 1), ',', '') AS REAL)
        * CAST(replace(substr(${norm}, instr(${norm}, '×') + 1), ',', '') AS REAL)
      ) / 144.0 * oi.quantity
    ELSE NULL
  END`;
}

/** Parse 72" × 36" / "72 x 36" / "72x36" (or similar) into sq.ft × quantity. */
export const SQFT_SQL = `COALESCE(
  NULLIF(${sizeSqftExpr("oi.size_standard")}, 0),
  NULLIF(${sizeSqftExpr("oi.size_requested")}, 0),
  0
)`;

export type ExecutiveReportFilters = {
  from?: string | undefined;
  to?: string | undefined;
  // Each id/name filter accepts a single value OR a comma-separated list (multi-select).
  distributorId?: string | undefined;
  dealerId?: string | undefined;
  dealerIds?: string | undefined;
  salesExecutiveId?: string | undefined;
  product?: string | undefined;
  category?: string | undefined;
  territory?: string | undefined;
  // Normalized structured-location filters (pincode master). Each accepts a single value or CSV.
  state?: string | undefined;
  district?: string | undefined;
  area?: string | undefined;
  pincode?: string | undefined;
  status?: string | undefined;
  campaignId?: string | undefined;
  // Pricing-tier filters (multi-select CSV). Filter on the tier SNAPSHOTTED on the order line at
  // sale time (oi.dealer_tier_id / oi.distributor_tier_id), not the account's current tier.
  dealerTier?: string | undefined;
  distributorTier?: string | undefined;
  // Drill-down only: restrict to order lines that have a computed area (sqft > 0).
  hasArea?: boolean | undefined;
};

export function defaultFromTo() {
  const now = new Date();
  const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const fromDate = new Date(now.getFullYear(), now.getMonth() - 17, 1);
  const from = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, "0")}`;
  return { from, to };
}

/**
 * Default from/to when the caller passes no explicit range — this is the "All time" default the
 * reports open with. It must SPAN THE ACTUAL DATA, not a fixed now-anchored 18-month window, so a
 * report opened without filters includes every month that has orders (including the edge months
 * that the old window silently clipped to 0). Falls back to defaultFromTo() when there's no data.
 */
export async function resolveDefaultRange(db: D1Database): Promise<{ from: string; to: string }> {
  const span = await db
    .prepare(
      `SELECT strftime('%Y-%m', MIN(placed_at)) AS minYm, strftime('%Y-%m', MAX(placed_at)) AS maxYm
       FROM orders WHERE deleted_at IS NULL`,
    )
    .first<{ minYm: string | null; maxYm: string | null }>();
  const fallback = defaultFromTo();
  const now = new Date();
  const nowYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const from = span?.minYm ?? fallback.from;
  // Extend "to" to the later of the newest data month and now, so recent months are always covered.
  const to = span?.maxYm && span.maxYm > nowYm ? span.maxYm : nowYm;
  return { from, to };
}

export function monthBounds(fromYm: string, toYm: string) {
  const [fy, fm] = fromYm.split("-").map(Number);
  const [ty, tm] = toYm.split("-").map(Number);
  const start = new Date(Date.UTC(fy!, fm! - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(ty!, tm!, 0, 23, 59, 59, 999));
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export function territoryFromLocation(location?: string | null): string {
  if (!location?.trim()) return "Other";
  const lower = location.toLowerCase();
  for (const name of STATE_NAMES) {
    if (lower.includes(name.toLowerCase())) return name;
  }
  for (const [city, state] of Object.entries(CITY_STATE)) {
    if (lower.includes(city)) return state;
  }
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] || "Other";
}

/**
 * Parse a filter value into a list. Every report filter accepts EITHER a single value or a
 * comma-separated list (multi-select), so "a" -> ["a"] and "a,b,c" -> ["a","b","c"]. Capped to
 * keep the IN(...) bind list bounded.
 */
function csvList(value?: string | null, cap = 300): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, cap);
}

/** `AND <col> IN (?, ?, …)` for a list; single-element lists still work. */
function inClause(column: string, values: string[], binds: unknown[]): string {
  if (!values.length) return "";
  binds.push(...values);
  return ` AND ${column} IN (${values.map(() => "?").join(",")})`;
}

function buildItemWhere(filters: ExecutiveReportFilters, range: { startIso: string; endIso: string }, binds: unknown[]) {
  let sql = ` AND o.deleted_at IS NULL AND o.placed_at >= ? AND o.placed_at <= ?`;
  binds.push(range.startIso, range.endIso);

  const statuses = csvList(filters.status);
  if (statuses.length) {
    sql += inClause("o.status", statuses, binds);
  } else {
    sql += ` AND o.status NOT IN ('rejected', 'cancelled')`;
  }

  // Each of these accepts a single id or a comma-separated list (multi-select). All filters are
  // ANDed together, so combining e.g. two distributors + two dealers narrows correctly.
  sql += inClause("o.distributor_id", csvList(filters.distributorId), binds);
  sql += inClause("o.dealer_id", csvList(filters.dealerId), binds);
  sql += inClause("d.sales_executive_user_id", csvList(filters.salesExecutiveId), binds);
  sql += inClause("oi.product_name", csvList(filters.product), binds);
  sql += inClause("p.category", csvList(filters.category), binds);
  sql += inClause("oi.campaign_id", csvList(filters.campaignId), binds);
  // Tier filters use the snapshotted tier on the line (historical-accurate).
  sql += inClause("oi.dealer_tier_id", csvList(filters.dealerTier), binds);
  sql += inClause("oi.distributor_tier_id", csvList(filters.distributorTier), binds);

  // Normalized structured-location filters (from the pincode master captured at signup). These use
  // the real dealers columns directly. Existing dealers without structured data simply won't match
  // a state/district/area filter (they surface under "Unassigned"), which is the intended behavior.
  sql += inClause("d.state", csvList(filters.state), binds);
  sql += inClause("d.district", csvList(filters.district), binds);
  sql += inClause("d.area", csvList(filters.area), binds);
  sql += inClause("d.pincode", csvList(filters.pincode), binds);

  // Territory filter: prefer the normalized `dealers.state`; for dealers that predate structured
  // location (state IS NULL/''), fall back to the legacy free-text LIKE heuristic so old data still
  // filters. Each selected territory matches EITHER the real state column OR the legacy text.
  const territories = csvList(filters.territory);
  if (territories.length) {
    const orParts: string[] = [];
    for (const territory of territories) {
      orParts.push("d.state = ?");
      binds.push(territory);
      orParts.push("((d.state IS NULL OR d.state = '') AND d.location LIKE ?)");
      binds.push(`%${territory}%`);
      const cities = Object.entries(CITY_STATE)
        .filter(([, state]) => state.toLowerCase() === territory.toLowerCase())
        .map(([city]) => city);
      for (const city of cities) {
        orParts.push("((d.state IS NULL OR d.state = '') AND LOWER(d.location) LIKE ?)");
        binds.push(`%${city}%`);
      }
    }
    sql += ` AND (${orParts.join(" OR ")})`;
  }

  // Drill-down for the "Area sold" metric scopes to lines that actually have a computed area,
  // so the Area card's underlying rows aren't diluted by size-less lines (Task 5 follow-up).
  if (filters.hasArea) {
    sql += ` AND (${SQFT_SQL}) > 0`;
  }
  if (filters.dealerIds) {
    const ids = filters.dealerIds.split(",").map((id) => id.trim()).filter(Boolean).slice(0, 200);
    if (ids.length) {
      sql += ` AND o.dealer_id IN (${ids.map(() => "?").join(",")})`;
      binds.push(...ids);
    }
  }
  return sql;
}

const ITEM_FROM = `FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  JOIN dealers d ON d.id = o.dealer_id
  LEFT JOIN products p ON p.id = oi.product_id
  LEFT JOIN distributors dist ON dist.id = o.distributor_id
  LEFT JOIN users se ON se.id = d.sales_executive_user_id
  LEFT JOIN price_campaigns pc ON pc.id = oi.campaign_id
  LEFT JOIN pricing_tiers dtier ON dtier.id = oi.dealer_tier_id
  LEFT JOIN pricing_tiers xtier ON xtier.id = oi.distributor_tier_id`;

// Distributor-facing revenue: what distributors transact at (distributor_price × qty), as opposed
// to line_total which is the dealer-facing amount. Falls back to line_total for legacy rows that
// predate distributor_price capture.
const DISTRIBUTOR_REVENUE_SQL = `COALESCE(oi.distributor_price, 0) * oi.quantity`;

export async function loadReportFilterOptions(db: D1Database) {
  const [{ results: distributors }, { results: dealerRows }, { results: executiveRows }, { results: products }, { results: categories }, { results: statuses }, { results: campaigns }] =
    await Promise.all([
      db.prepare(`SELECT id, name FROM distributors WHERE deleted_at IS NULL ORDER BY name`).all<{ id: string; name: string }>(),
      // Dealers carry their distributor + sales-exec + location so the frontend can cascade
      // the dependent filters (territory → distributor → sales exec → dealer) without a table.
      db
        .prepare(
          `SELECT id, store_name AS name, distributor_id AS distributorId,
                  sales_executive_user_id AS salesExecutiveId, location,
                  state, district, area, pincode
           FROM dealers WHERE deleted_at IS NULL ORDER BY store_name`,
        )
        .all<{
          id: string;
          name: string;
          distributorId: string | null;
          salesExecutiveId: string | null;
          location: string | null;
          state: string | null;
          district: string | null;
          area: string | null;
          pincode: string | null;
        }>(),
      // A sales exec's distributor is users.distributor_id, falling back to the distributor of
      // any dealer they manage (mirrors assignments.ts). This lets Distributor→Sales Exec cascade.
      db
        .prepare(
          `SELECT u.id, u.name,
                  COALESCE(
                    u.distributor_id,
                    (SELECT d.distributor_id FROM dealers d
                     WHERE d.sales_executive_user_id = u.id AND d.deleted_at IS NULL
                     ORDER BY d.created_at LIMIT 1)
                  ) AS distributorId
           FROM users u
           WHERE u.role = 'sales_executive' AND u.deleted_at IS NULL AND u.status = 'active'
           ORDER BY u.name`,
        )
        .all<{ id: string; name: string; distributorId: string | null }>(),
      db.prepare(`SELECT DISTINCT product_name as name FROM order_items ORDER BY product_name LIMIT 80`).all<{ name: string }>(),
      db.prepare(`SELECT DISTINCT category FROM products WHERE deleted_at IS NULL ORDER BY category`).all<{ category: string }>(),
      db
        .prepare(`SELECT DISTINCT status FROM orders WHERE deleted_at IS NULL ORDER BY status`)
        .all<{ status: string }>(),
      db
        .prepare(`SELECT id, name FROM price_campaigns WHERE deleted_at IS NULL ORDER BY name`)
        .all<{ id: string; name: string }>(),
    ]);

  // Attach normalized location to each dealer so the frontend can cascade State → District → Area →
  // Dealer. `state` prefers the real column; when absent (legacy dealers) it falls back to the
  // derived territory so old data still groups somewhere instead of vanishing.
  const dealers = dealerRows.map((d) => {
    const state = (d.state ?? "").trim() || territoryFromLocation(d.location);
    return {
      id: d.id,
      name: d.name,
      distributorId: d.distributorId ?? undefined,
      salesExecutiveId: d.salesExecutiveId ?? undefined,
      territory: state,
      state,
      district: (d.district ?? "").trim() || undefined,
      area: (d.area ?? "").trim() || undefined,
      pincode: (d.pincode ?? "").trim() || undefined,
    };
  });
  const executives = executiveRows.map((e) => ({
    id: e.id,
    name: e.name,
    distributorId: e.distributorId ?? undefined,
  }));

  const territories = [...new Set(dealers.map((d) => d.territory))].filter(Boolean).sort();
  const states = territories;
  const districts = [...new Set(dealers.map((d) => d.district).filter(Boolean))].sort() as string[];
  const areas = [...new Set(dealers.map((d) => d.area).filter(Boolean))].sort() as string[];

  // Month list for the From/To/Year filters. This MUST be derived from the actual data span, not a
  // fixed now-anchored window: previously it was the last 24 calendar months, so any month with
  // orders that fell outside that rolling window (e.g. when the server clock differs from the data)
  // was missing from the dropdown — which meant "Year"/"All" (whose range is assembled from this
  // list) silently excluded it and showed 0, even though picking that month directly worked.
  // We take the full span from the OLDEST order month to the LATEST order month, and also extend to
  // "now" so an empty current month still shows for placing new orders. Every month with data is
  // therefore always selectable and always inside the Year/All range.
  const span = await db
    .prepare(
      `SELECT strftime('%Y-%m', MIN(placed_at)) AS minYm, strftime('%Y-%m', MAX(placed_at)) AS maxYm
       FROM orders WHERE deleted_at IS NULL`,
    )
    .first<{ minYm: string | null; maxYm: string | null }>();

  const now = new Date();
  const nowYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  // Bounds: earliest = oldest data month (fallback: 23 months before now); latest = max(data, now).
  const defaultStart = new Date(now.getFullYear(), now.getMonth() - 23, 1);
  const defaultStartYm = `${defaultStart.getFullYear()}-${String(defaultStart.getMonth() + 1).padStart(2, "0")}`;
  const startYm = span?.minYm && span.minYm < defaultStartYm ? span.minYm : (span?.minYm ?? defaultStartYm);
  const endYm = span?.maxYm && span.maxYm > nowYm ? span.maxYm : nowYm;

  // Enumerate every month from startYm..endYm inclusive (UTC-safe, string-keyed).
  const monthValues: string[] = [];
  {
    const [sy, sm] = startYm.split("-").map(Number);
    const [ey, em] = endYm.split("-").map(Number);
    let y = sy!;
    let m = sm!;
    // Guard against a bad span producing an unbounded loop.
    for (let guard = 0; guard < 600 && (y < ey! || (y === ey! && m <= em!)); guard++) {
      monthValues.push(`${y}-${String(m).padStart(2, "0")}`);
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }

  // Pricing tiers (id + name) power both the tier filters and the "By pricing tier" breakdown.
  // Tolerant of the table not existing (older DBs): empty list means no tier filter is shown.
  let tiers: Array<{ id: string; name: string }> = [];
  try {
    const { results } = await db
      .prepare(`SELECT id, name FROM pricing_tiers WHERE deleted_at IS NULL ORDER BY sort_order, name`)
      .all<{ id: string; name: string }>();
    tiers = results.map((r) => ({ id: r.id, name: r.name }));
  } catch {
    tiers = [];
  }

  return {
    months: monthValues,
    distributors,
    dealers,
    executives,
    campaigns,
    products: products.map((p) => p.name).filter(Boolean),
    categories: categories.map((c) => c.category).filter(Boolean),
    statuses: statuses.map((s) => s.status).filter(Boolean),
    territories,
    states,
    districts,
    areas,
    tiers,
  };
}

async function totals(db: D1Database, filters: ExecutiveReportFilters, range: { startIso: string; endIso: string }) {
  const binds: unknown[] = [];
  const where = buildItemWhere(filters, range, binds);
  const row = await db
    .prepare(
      `SELECT
         COALESCE(SUM(oi.line_total), 0) as revenue,
         COALESCE(SUM(oi.quantity), 0) as pcs,
         COALESCE(SUM(${SQFT_SQL}), 0) as sqft,
         COUNT(DISTINCT o.id) as orders,
         COUNT(DISTINCT oi.id) as lines
       ${ITEM_FROM}
       WHERE 1=1${where}`,
    )
    .bind(...binds)
    .first<{ revenue: number; pcs: number; sqft: number; orders: number; lines: number }>();
  return {
    revenue: Number(row?.revenue ?? 0),
    pcs: Number(row?.pcs ?? 0),
    sqft: Number(row?.sqft ?? 0),
    orders: Number(row?.orders ?? 0),
    lines: Number(row?.lines ?? 0),
  };
}

export async function buildMonthlySeries(db: D1Database, filters: ExecutiveReportFilters, range: { startIso: string; endIso: string }) {
  const binds: unknown[] = [];
  const where = buildItemWhere(filters, range, binds);
  const { results } = await db
    .prepare(
      `SELECT strftime('%Y-%m', o.placed_at) as ym,
         COALESCE(SUM(oi.line_total), 0) as revenue,
         COALESCE(SUM(oi.quantity), 0) as pcs,
         COALESCE(SUM(${SQFT_SQL}), 0) as sqft,
         COUNT(DISTINCT o.id) as orders
       ${ITEM_FROM}
       WHERE 1=1${where}
       GROUP BY ym
       ORDER BY ym ASC`,
    )
    .bind(...binds)
    .all<{ ym: string; revenue: number; pcs: number; sqft: number; orders: number }>();

  return results.map((r, i, arr) => {
    const prev = i > 0 ? Number(arr[i - 1]!.revenue) : 0;
    const revenue = Number(r.revenue);
    const pcs = Number(r.pcs);
    const sqft = Number(r.sqft);
    const mom = prev === 0 ? (revenue > 0 ? 100 : 0) : ((revenue - prev) / prev) * 100;
    return {
      ym: r.ym,
      label: formatYm(r.ym),
      short: formatYmShort(r.ym),
      revenue,
      pcs,
      sqft,
      orders: Number(r.orders),
      avgPerSqft: sqft > 0 ? revenue / sqft : 0,
      mom,
    };
  });
}

function formatYm(ym: string) {
  const [y, m] = ym.split("-");
  const idx = Number(m) - 1;
  return `${MONTHS[idx] ?? m} ${y}`;
}

function formatYmShort(ym: string) {
  const m = Number(ym.slice(5, 7));
  return MONTHS[m - 1] ?? ym;
}

export async function buildTerritories(db: D1Database, filters: ExecutiveReportFilters, range: { startIso: string; endIso: string }) {
  const binds: unknown[] = [];
  const where = buildItemWhere(filters, range, binds);
  const { results } = await db
    .prepare(
      `SELECT d.location as location, d.state as state,
         COALESCE(SUM(oi.line_total), 0) as revenue,
         COALESCE(SUM(oi.quantity), 0) as pcs,
         COALESCE(SUM(${SQFT_SQL}), 0) as sqft,
         COUNT(DISTINCT d.id) as customers
       ${ITEM_FROM}
       WHERE 1=1${where}
       GROUP BY COALESCE(NULLIF(d.state, ''), d.location)`,
    )
    .bind(...binds)
    .all<{ location: string; state: string | null; revenue: number; pcs: number; sqft: number; customers: number }>();

  const rolled = new Map<string, { revenue: number; pcs: number; sqft: number; customers: number }>();
  for (const row of results) {
    // Prefer the normalized state; fall back to the derived territory for legacy dealers.
    const key = (row.state ?? "").trim() || territoryFromLocation(row.location);
    const cur = rolled.get(key) ?? { revenue: 0, pcs: 0, sqft: 0, customers: 0 };
    cur.revenue += Number(row.revenue);
    cur.pcs += Number(row.pcs);
    cur.sqft += Number(row.sqft);
    cur.customers += Number(row.customers);
    rolled.set(key, cur);
  }
  const totalRev = [...rolled.values()].reduce((s, r) => s + r.revenue, 0) || 1;
  return [...rolled.entries()]
    .map(([name, v]) => ({
      name,
      revenue: v.revenue,
      pcs: v.pcs,
      sqft: v.sqft,
      customers: v.customers,
      share: (v.revenue / totalRev) * 100,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

export async function buildAccounts(db: D1Database, filters: ExecutiveReportFilters, range: { startIso: string; endIso: string }) {
  const binds: unknown[] = [];
  const where = buildItemWhere(filters, range, binds);
  const { results } = await db
    .prepare(
      `SELECT d.id, d.store_name as name, d.location, d.state, d.district, d.area, d.pincode,
         dist.id as distributorId,
         dist.name as distributorName,
         d.sales_executive_user_id as salesExecutiveId,
         se.name as salesExecutiveName,
         MAX(COALESCE(dtier.name, 'Unassigned')) as dealerTierName,
         MAX(COALESCE(xtier.name, 'Unassigned')) as distributorTierName,
         COALESCE(SUM(oi.line_total), 0) as revenue,
         COALESCE(SUM(oi.quantity), 0) as pcs,
         COALESCE(SUM(${SQFT_SQL}), 0) as sqft
       ${ITEM_FROM}
       WHERE 1=1${where}
       GROUP BY d.id
       ORDER BY revenue DESC`,
    )
    .bind(...binds)
    .all<{
      id: string;
      name: string;
      location: string;
      state: string | null;
      district: string | null;
      area: string | null;
      pincode: string | null;
      distributorId: string | null;
      distributorName: string | null;
      salesExecutiveId: string | null;
      salesExecutiveName: string | null;
      dealerTierName: string | null;
      distributorTierName: string | null;
      revenue: number;
      pcs: number;
      sqft: number;
    }>();

  const totalRev = results.reduce((s, r) => s + Number(r.revenue), 0) || 1;
  let cumulative = 0;
  return results.map((r, i) => {
    const revenue = Number(r.revenue);
    const prevShare = (cumulative / totalRev) * 100;
    cumulative += revenue;
    const share = (revenue / totalRev) * 100;
    const tier = prevShare < 70 ? "A" : prevShare < 90 ? "B" : "C";
    return {
      id: r.id,
      name: r.name,
      rank: i + 1,
      tier,
      revenue,
      share,
      pcs: Number(r.pcs),
      sqft: Number(r.sqft),
      territory: (r.state ?? "").trim() || territoryFromLocation(r.location),
      state: (r.state ?? "").trim() || territoryFromLocation(r.location),
      district: (r.district ?? "").trim() || undefined,
      area: (r.area ?? "").trim() || undefined,
      pincode: (r.pincode ?? "").trim() || undefined,
      distributorId: r.distributorId ?? "",
      distributorName: r.distributorName ?? "—",
      salesExecutiveId: r.salesExecutiveId ?? "",
      salesExecutiveName: r.salesExecutiveName ?? "—",
      dealerTierName: (r.dealerTierName ?? "Unassigned") || "Unassigned",
      distributorTierName: (r.distributorTierName ?? "Unassigned") || "Unassigned",
    };
  });
}

export async function buildProducts(db: D1Database, filters: ExecutiveReportFilters, range: { startIso: string; endIso: string }) {
  const binds: unknown[] = [];
  const where = buildItemWhere(filters, range, binds);
  const { results } = await db
    .prepare(
      `SELECT oi.product_id as id, oi.product_name as name, COALESCE(p.category, 'Uncategorised') as category,
         COALESCE(SUM(oi.line_total), 0) as revenue,
         COALESCE(SUM(oi.quantity), 0) as pcs,
         COALESCE(SUM(${SQFT_SQL}), 0) as sqft
       ${ITEM_FROM}
       WHERE 1=1${where}
       GROUP BY oi.product_id, oi.product_name
       ORDER BY revenue DESC`,
    )
    .bind(...binds)
    .all<{ id: string; name: string; category: string; revenue: number; pcs: number; sqft: number }>();

  const totalRev = results.reduce((s, r) => s + Number(r.revenue), 0) || 1;
  return results.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    revenue: Number(r.revenue),
    pcs: Number(r.pcs),
    sqft: Number(r.sqft),
    share: (Number(r.revenue) / totalRev) * 100,
  }));
}

export async function buildCampaigns(db: D1Database, filters: ExecutiveReportFilters, range: { startIso: string; endIso: string }) {
  const binds: unknown[] = [];
  const where = buildItemWhere(filters, range, binds);
  const { results } = await db
    .prepare(
      `SELECT oi.campaign_id as id, COALESCE(pc.name, 'Campaign') as name,
         COALESCE(SUM(oi.line_total), 0) as revenue,
         COALESCE(SUM(oi.quantity), 0) as pcs,
         COUNT(DISTINCT o.id) as orders
       ${ITEM_FROM}
       WHERE 1=1${where} AND oi.campaign_id IS NOT NULL AND oi.campaign_id != ''
       GROUP BY oi.campaign_id
       ORDER BY revenue DESC
       LIMIT 12`,
    )
    .bind(...binds)
    .all<{ id: string; name: string; revenue: number; pcs: number; orders: number }>();
  return results.map((r) => ({
    id: r.id,
    name: r.name,
    revenue: Number(r.revenue),
    pcs: Number(r.pcs),
    orders: Number(r.orders),
  }));
}

export type TierBreakdownRow = {
  tierId: string;
  tierName: string;
  /** Dealer-facing revenue = SUM(line_total). */
  revenue: number;
  /** Distributor-facing revenue = SUM(distributor_price × qty). */
  distributorRevenue: number;
  pcs: number;
  sqft: number;
  orders: number;
  /** Distinct dealers (for dealer-tier rows) or distributors (for distributor-tier rows). */
  accounts: number;
  avgDealerMarginPercent: number;
  avgDistributorMarginPercent: number;
  /** MRP value minus dealer-facing revenue = total discount given off MRP. */
  marginSpread: number;
};

/**
 * Per-pricing-tier rollup for BOTH sides:
 *  - dealerTiers: grouped by the DEALER tier snapshotted on each line (oi.dealer_tier_id).
 *  - distributorTiers: grouped by the DISTRIBUTOR tier (oi.distributor_tier_id).
 * All metrics respect the current filters/date range. Uses the tier snapshotted at sale time so
 * moving an account to a new tier later doesn't rewrite past months.
 */
export async function buildTierBreakdown(
  db: D1Database,
  filters: ExecutiveReportFilters,
  range: { startIso: string; endIso: string },
): Promise<{ dealerTiers: TierBreakdownRow[]; distributorTiers: TierBreakdownRow[] }> {
  const querySide = async (
    tierIdCol: string,
    tierNameCol: string,
    accountCol: string,
  ): Promise<TierBreakdownRow[]> => {
    const binds: unknown[] = [];
    const where = buildItemWhere(filters, range, binds);
    const { results } = await db
      .prepare(
        `SELECT ${tierIdCol} as tierId,
           COALESCE(${tierNameCol}, 'Unassigned') as tierName,
           COALESCE(SUM(oi.line_total), 0) as revenue,
           COALESCE(SUM(${DISTRIBUTOR_REVENUE_SQL}), 0) as distributorRevenue,
           COALESCE(SUM(oi.quantity), 0) as pcs,
           COALESCE(SUM(${SQFT_SQL}), 0) as sqft,
           COUNT(DISTINCT o.id) as orders,
           COUNT(DISTINCT ${accountCol}) as accounts,
           COALESCE(AVG(oi.dealer_margin_percent), 0) as avgDealerMarginPercent,
           COALESCE(AVG(oi.distributor_margin_percent), 0) as avgDistributorMarginPercent,
           COALESCE(SUM(oi.mrp * oi.quantity), 0) - COALESCE(SUM(oi.line_total), 0) as marginSpread
         ${ITEM_FROM}
         WHERE 1=1${where}
         GROUP BY ${tierIdCol}
         ORDER BY revenue DESC`,
      )
      .bind(...binds)
      .all<Record<string, number | string>>();
    return results.map((r) => ({
      tierId: String(r.tierId ?? ""),
      tierName: String(r.tierName ?? "Unassigned"),
      revenue: Number(r.revenue),
      distributorRevenue: Number(r.distributorRevenue),
      pcs: Number(r.pcs),
      sqft: Number(r.sqft),
      orders: Number(r.orders),
      accounts: Number(r.accounts),
      avgDealerMarginPercent: Number(r.avgDealerMarginPercent),
      avgDistributorMarginPercent: Number(r.avgDistributorMarginPercent),
      marginSpread: Number(r.marginSpread),
    }));
  };

  const [dealerTiers, distributorTiers] = await Promise.all([
    querySide("oi.dealer_tier_id", "dtier.name", "o.dealer_id"),
    querySide("oi.distributor_tier_id", "xtier.name", "o.distributor_id"),
  ]);
  return { dealerTiers, distributorTiers };
}

export async function buildExecutiveSnapshot(db: D1Database, raw: ExecutiveReportFilters = {}) {
  const defaults = await resolveDefaultRange(db);
  const filters = { ...raw, from: raw.from ?? defaults.from, to: raw.to ?? defaults.to };
  const range = monthBounds(filters.from!, filters.to!);
  const [kpis, monthly, territories, campaigns, tierBreakdown, filterOptions] = await Promise.all([
    totals(db, filters, range),
    buildMonthlySeries(db, filters, range),
    buildTerritories(db, filters, range),
    buildCampaigns(db, filters, range),
    buildTierBreakdown(db, filters, range),
    loadReportFilterOptions(db),
  ]);
  const peak = monthly.reduce<(typeof monthly)[0] | null>((best, row) => (!best || row.revenue > best.revenue ? row : best), null);
  return {
    kind: "snapshot" as const,
    filters,
    filterOptions,
    kpis: {
      ...kpis,
      avgTicket: kpis.pcs > 0 ? kpis.revenue / kpis.pcs : 0,
      yieldPerSqft: kpis.sqft > 0 ? kpis.revenue / kpis.sqft : 0,
    },
    monthly,
    territories,
    campaigns,
    tierBreakdown,
    peak,
  };
}

export async function buildMonthlyReport(db: D1Database, raw: ExecutiveReportFilters = {}) {
  const snapshot = await buildExecutiveSnapshot(db, raw);
  return { ...snapshot, kind: "monthly" as const };
}

export async function buildAccountsReport(db: D1Database, raw: ExecutiveReportFilters = {}) {
  const defaults = await resolveDefaultRange(db);
  const filters = { ...raw, from: raw.from ?? defaults.from, to: raw.to ?? defaults.to };
  const range = monthBounds(filters.from!, filters.to!);
  const [accounts, filterOptions, kpis] = await Promise.all([
    buildAccounts(db, filters, range),
    loadReportFilterOptions(db),
    totals(db, filters, range),
  ]);
  const tierA = accounts.filter((a) => a.tier === "A");
  const tierB = accounts.filter((a) => a.tier === "B");
  const tierC = accounts.filter((a) => a.tier === "C");
  return {
    kind: "accounts" as const,
    filters,
    filterOptions,
    kpis,
    tiers: {
      A: { count: tierA.length, revenue: tierA.reduce((s, a) => s + a.revenue, 0) },
      B: { count: tierB.length, revenue: tierB.reduce((s, a) => s + a.revenue, 0) },
      C: { count: tierC.length, revenue: tierC.reduce((s, a) => s + a.revenue, 0) },
    },
    accounts,
  };
}

export async function buildProductsReport(db: D1Database, raw: ExecutiveReportFilters = {}) {
  const defaults = await resolveDefaultRange(db);
  const filters = { ...raw, from: raw.from ?? defaults.from, to: raw.to ?? defaults.to };
  const range = monthBounds(filters.from!, filters.to!);
  const [products, kpis, filterOptions] = await Promise.all([
    buildProducts(db, filters, range),
    totals(db, filters, range),
    loadReportFilterOptions(db),
  ]);
  const skuCount = products.length;
  const avgProductRevenue = skuCount ? kpis.revenue / skuCount : 0;
  const avgUnitSize = kpis.pcs ? kpis.sqft / kpis.pcs : 0;
  return {
    kind: "products" as const,
    filters,
    filterOptions,
    kpis: {
      ...kpis,
      skuCount,
      avgProductRevenue,
      yieldPerSqft: kpis.sqft > 0 ? kpis.revenue / kpis.sqft : 0,
      avgUnitSize,
    },
    products,
    top: products.slice(0, 6),
  };
}

export async function drilldownOrders(
  db: D1Database,
  raw: ExecutiveReportFilters & { month?: string; page?: number; pageSize?: number },
) {
  const defaults = await resolveDefaultRange(db);
  const filters: ExecutiveReportFilters = {
    ...raw,
    from: raw.month ?? raw.from ?? defaults.from,
    to: raw.month ?? raw.to ?? defaults.to,
    dealerIds: raw.dealerIds,
    campaignId: raw.campaignId,
  };
  const range = monthBounds(filters.from!, filters.to!);
  const page = Math.max(1, raw.page ?? 1);
  const pageSize = Math.min(50, Math.max(10, raw.pageSize ?? 20));
  const binds: unknown[] = [];
  const where = buildItemWhere(filters, range, binds);

  const countRow = await db
    .prepare(`SELECT COUNT(*) as c ${ITEM_FROM} WHERE 1=1${where}`)
    .bind(...binds)
    .first<{ c: number }>();
  const total = Number(countRow?.c ?? 0);

  const { results } = await db
    .prepare(
      `SELECT
         o.id as orderId,
         o.placed_at as placedAt,
         o.status,
         d.store_name as dealerName,
         dist.name as distributorName,
         se.name as salesExecutiveName,
         oi.product_name as product,
         COALESCE(p.category, '') as category,
         COALESCE(oi.size_standard, oi.size_requested, '') as size,
         COALESCE(oi.thickness, '') as thickness,
         oi.quantity,
         (${SQFT_SQL}) as sqft,
         oi.mrp,
         oi.dealer_price as dealerPrice,
         oi.distributor_price as distributorPrice,
         oi.distributor_margin_percent as distributorMarginPercent,
         COALESCE(oi.discount_percent, 0) as discountPercent,
         oi.line_total as finalPrice,
         COALESCE(pc.name, '') as campaignName,
         COALESCE(oi.points_earned, 0) as pointsEarned
       ${ITEM_FROM}
       WHERE 1=1${where}
       ORDER BY o.placed_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...binds, pageSize, (page - 1) * pageSize)
    .all<{
      orderId: string;
      placedAt: string;
      status: string;
      dealerName: string;
      distributorName: string | null;
      salesExecutiveName: string | null;
      product: string;
      category: string;
      size: string;
      thickness: string;
      quantity: number;
      sqft: number;
      mrp: number;
      dealerPrice: number;
      distributorPrice: number | null;
      distributorMarginPercent: number | null;
      discountPercent: number;
      finalPrice: number;
      campaignName: string;
      pointsEarned: number;
    }>();

  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    items: results.map((r) => ({
      orderId: String(r.orderId),
      placedAt: formatInLabel(String(r.placedAt ?? "")),
      status: String(r.status ?? ""),
      dealerName: String(r.dealerName ?? ""),
      distributorName: String(r.distributorName ?? "—"),
      salesExecutiveName: String(r.salesExecutiveName ?? "—"),
      product: String(r.product ?? ""),
      category: String(r.category ?? ""),
      size: String(r.size ?? ""),
      thickness: String(r.thickness ?? ""),
      quantity: Number(r.quantity ?? 0),
      sqft: Number(r.sqft ?? 0),
      mrp: Number(r.mrp ?? 0),
      dealerPrice: Number(r.dealerPrice ?? 0),
      distributorPrice: Number(r.distributorPrice ?? 0),
      distributorMarginPercent: Number(r.distributorMarginPercent ?? 0),
      discountPercent: Number(r.discountPercent ?? 0),
      finalPrice: Number(r.finalPrice ?? 0),
      campaignName: String(r.campaignName ?? ""),
      pointsEarned: Number(r.pointsEarned ?? 0),
    })),
  };
}
