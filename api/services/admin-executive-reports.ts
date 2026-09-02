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
  const norm = `replace(replace(replace(COALESCE(${col}, ''), ' x ', '×'), ' X ', '×'), '×', '×')`;
  return `CASE
    WHEN ${col} IS NOT NULL AND instr(${norm}, '×') > 0 AND instr(${col}, '"') > 0 THEN
      (
        CAST(replace(trim(substr(${col}, 1, instr(${col}, '"') - 1)), ',', '') AS REAL)
        * CAST(replace(replace(trim(substr(${norm}, instr(${norm}, '×') + 1)), '"', ''), ',', '') AS REAL)
      ) / 144.0 * oi.quantity
    ELSE NULL
  END`;
}

/** Parse 72" × 36" (or similar) into sq.ft × quantity. */
export const SQFT_SQL = `COALESCE(${sizeSqftExpr("oi.size_standard")}, ${sizeSqftExpr("oi.size_requested")}, 0)`;

export type ExecutiveReportFilters = {
  from?: string | undefined;
  to?: string | undefined;
  distributorId?: string | undefined;
  dealerId?: string | undefined;
  dealerIds?: string | undefined;
  salesExecutiveId?: string | undefined;
  product?: string | undefined;
  category?: string | undefined;
  territory?: string | undefined;
  status?: string | undefined;
  campaignId?: string | undefined;
};

export function defaultFromTo() {
  const now = new Date();
  const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const fromDate = new Date(now.getFullYear(), now.getMonth() - 17, 1);
  const from = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, "0")}`;
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

function buildItemWhere(filters: ExecutiveReportFilters, range: { startIso: string; endIso: string }, binds: unknown[]) {
  let sql = ` AND o.deleted_at IS NULL AND o.placed_at >= ? AND o.placed_at <= ?`;
  binds.push(range.startIso, range.endIso);
  if (filters.status) {
    sql += ` AND o.status = ?`;
    binds.push(filters.status);
  } else {
    sql += ` AND o.status NOT IN ('rejected', 'cancelled')`;
  }
  if (filters.distributorId) {
    sql += ` AND o.distributor_id = ?`;
    binds.push(filters.distributorId);
  }
  if (filters.dealerId) {
    sql += ` AND o.dealer_id = ?`;
    binds.push(filters.dealerId);
  }
  if (filters.salesExecutiveId) {
    sql += ` AND d.sales_executive_user_id = ?`;
    binds.push(filters.salesExecutiveId);
  }
  if (filters.product) {
    sql += ` AND oi.product_name = ?`;
    binds.push(filters.product);
  }
  if (filters.category) {
    sql += ` AND p.category = ?`;
    binds.push(filters.category);
  }
  if (filters.territory) {
    const cities = Object.entries(CITY_STATE)
      .filter(([, state]) => state.toLowerCase() === filters.territory!.toLowerCase())
      .map(([city]) => city);
    const parts = ["d.location LIKE ?"];
    binds.push(`%${filters.territory}%`);
    for (const city of cities) {
      parts.push("LOWER(d.location) LIKE ?");
      binds.push(`%${city}%`);
    }
    sql += ` AND (${parts.join(" OR ")})`;
  }
  if (filters.campaignId) {
    sql += ` AND oi.campaign_id = ?`;
    binds.push(filters.campaignId);
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
  LEFT JOIN price_campaigns pc ON pc.id = oi.campaign_id`;

export async function loadReportFilterOptions(db: D1Database) {
  const [{ results: distributors }, { results: dealers }, { results: executives }, { results: products }, { results: categories }, { results: statuses }] =
    await Promise.all([
      db.prepare(`SELECT id, name FROM distributors WHERE deleted_at IS NULL ORDER BY name`).all<{ id: string; name: string }>(),
      db.prepare(`SELECT id, store_name as name FROM dealers WHERE deleted_at IS NULL ORDER BY store_name`).all<{ id: string; name: string }>(),
      db
        .prepare(
          `SELECT id, name FROM users WHERE role = 'sales_executive' AND deleted_at IS NULL AND status = 'active' ORDER BY name`,
        )
        .all<{ id: string; name: string }>(),
      db.prepare(`SELECT DISTINCT product_name as name FROM order_items ORDER BY product_name LIMIT 80`).all<{ name: string }>(),
      db.prepare(`SELECT DISTINCT category FROM products WHERE deleted_at IS NULL ORDER BY category`).all<{ category: string }>(),
      db
        .prepare(`SELECT DISTINCT status FROM orders WHERE deleted_at IS NULL ORDER BY status`)
        .all<{ status: string }>(),
    ]);

  const { results: locations } = await db
    .prepare(`SELECT DISTINCT location FROM dealers WHERE deleted_at IS NULL AND location IS NOT NULL`)
    .all<{ location: string }>();
  const territories = [...new Set(locations.map((l) => territoryFromLocation(l.location)))].sort();

  const monthValues: string[] = [];
  const now = new Date();
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthValues.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  return {
    months: monthValues,
    distributors,
    dealers,
    executives,
    products: products.map((p) => p.name).filter(Boolean),
    categories: categories.map((c) => c.category).filter(Boolean),
    statuses: statuses.map((s) => s.status).filter(Boolean),
    territories,
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
      `SELECT d.location as location,
         COALESCE(SUM(oi.line_total), 0) as revenue,
         COALESCE(SUM(oi.quantity), 0) as pcs,
         COALESCE(SUM(${SQFT_SQL}), 0) as sqft,
         COUNT(DISTINCT d.id) as customers
       ${ITEM_FROM}
       WHERE 1=1${where}
       GROUP BY d.location`,
    )
    .bind(...binds)
    .all<{ location: string; revenue: number; pcs: number; sqft: number; customers: number }>();

  const rolled = new Map<string, { revenue: number; pcs: number; sqft: number; customers: number }>();
  for (const row of results) {
    const key = territoryFromLocation(row.location);
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
      `SELECT d.id, d.store_name as name, d.location,
         dist.id as distributorId,
         dist.name as distributorName,
         d.sales_executive_user_id as salesExecutiveId,
         se.name as salesExecutiveName,
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
      distributorId: string | null;
      distributorName: string | null;
      salesExecutiveId: string | null;
      salesExecutiveName: string | null;
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
      territory: territoryFromLocation(r.location),
      distributorId: r.distributorId ?? "",
      distributorName: r.distributorName ?? "—",
      salesExecutiveId: r.salesExecutiveId ?? "",
      salesExecutiveName: r.salesExecutiveName ?? "—",
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

export async function buildExecutiveSnapshot(db: D1Database, raw: ExecutiveReportFilters = {}) {
  const defaults = defaultFromTo();
  const filters = { ...raw, from: raw.from ?? defaults.from, to: raw.to ?? defaults.to };
  const range = monthBounds(filters.from!, filters.to!);
  const [kpis, monthly, territories, campaigns, filterOptions] = await Promise.all([
    totals(db, filters, range),
    buildMonthlySeries(db, filters, range),
    buildTerritories(db, filters, range),
    buildCampaigns(db, filters, range),
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
    peak,
  };
}

export async function buildMonthlyReport(db: D1Database, raw: ExecutiveReportFilters = {}) {
  const snapshot = await buildExecutiveSnapshot(db, raw);
  return { ...snapshot, kind: "monthly" as const };
}

export async function buildAccountsReport(db: D1Database, raw: ExecutiveReportFilters = {}) {
  const defaults = defaultFromTo();
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
  const defaults = defaultFromTo();
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
  const defaults = defaultFromTo();
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
