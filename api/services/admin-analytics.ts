const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function inrCompact(n: number) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}

export type AdminAnalyticsQuery = {
  month?: string;
  fromMonth?: string;
  toMonth?: string;
  distributorId?: string;
  salesExecutiveId?: string;
  dealerId?: string;
  product?: string;
  search?: string;
};

function monthIndex(label: string): number {
  const short = label.slice(0, 3);
  const idx = MONTHS.findIndex((m) => m === short);
  return idx >= 0 ? idx : new Date().getMonth();
}

function monthRange(filters: AdminAnalyticsQuery) {
  const year = new Date().getFullYear();
  const from = filters.fromMonth ?? filters.month ?? "Aug";
  const to = filters.toMonth ?? filters.month ?? from;
  const startMonth = monthIndex(from);
  const endMonth = monthIndex(to);
  const start = new Date(year, Math.min(startMonth, endMonth), 1);
  const end = new Date(year, Math.max(startMonth, endMonth) + 1, 0, 23, 59, 59);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function formatMonthLabel(d: Date) {
  return d.toLocaleString("en-IN", { month: "short" });
}

function pctChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function deltaMetric(value: number, previous: number) {
  const changePct = pctChange(value, previous);
  return {
    value,
    previous,
    changePct,
    direction: changePct > 0 ? "up" as const : changePct < 0 ? "down" as const : "flat" as const,
  };
}

async function loadFilterOptions(db: D1Database, filters: AdminAnalyticsQuery) {
  const { results: distributors } = await db
    .prepare(`SELECT id, name FROM distributors WHERE deleted_at IS NULL ORDER BY name`)
    .all<{ id: string; name: string }>();

  let seSql = `SELECT id, name, distributor_id FROM users WHERE role = 'sales_executive' AND deleted_at IS NULL`;
  const seBinds: unknown[] = [];
  if (filters.distributorId) {
    seSql += ` AND distributor_id = ?`;
    seBinds.push(filters.distributorId);
  }
  const { results: salesExecutives } = await db.prepare(seSql).bind(...seBinds).all<{
    id: string;
    name: string;
    distributor_id: string;
  }>();

  let dealerSql = `SELECT id, store_name as name, distributor_id FROM dealers WHERE deleted_at IS NULL`;
  const dealerBinds: unknown[] = [];
  if (filters.distributorId) {
    dealerSql += ` AND distributor_id = ?`;
    dealerBinds.push(filters.distributorId);
  }
  if (filters.salesExecutiveId) {
    dealerSql += ` AND sales_executive_user_id = ?`;
    dealerBinds.push(filters.salesExecutiveId);
  }
  dealerSql += ` ORDER BY store_name`;
  const { results: dealers } = await db.prepare(dealerSql).bind(...dealerBinds).all<{
    id: string;
    name: string;
    distributor_id: string;
  }>();

  const { results: products } = await db
    .prepare(`SELECT DISTINCT product_name as product FROM order_items ORDER BY product_name LIMIT 30`)
    .all<{ product: string }>();

  return {
    months: ["Mar", "Apr", "May", "Jun", "Jul", "Aug"],
    distributors: distributors.map((d) => ({ id: d.id, name: d.name })),
    salesExecutives: salesExecutives.map((s) => ({
      id: s.id,
      name: s.name,
      distributorId: s.distributor_id ?? "",
    })),
    dealers: dealers.map((d) => ({ id: d.id, name: d.name, distributorId: d.distributor_id })),
    products: products.map((p) => p.product),
    categories: ["Mattress", "Pillow", "Accessories"],
  };
}

function buildDealerWhere(filters: AdminAnalyticsQuery, binds: unknown[]) {
  let sql = "";
  if (filters.distributorId) {
    sql += ` AND d.distributor_id = ?`;
    binds.push(filters.distributorId);
  }
  if (filters.salesExecutiveId) {
    sql += ` AND d.sales_executive_user_id = ?`;
    binds.push(filters.salesExecutiveId);
  }
  if (filters.dealerId) {
    sql += ` AND d.id = ?`;
    binds.push(filters.dealerId);
  }
  if (filters.search?.trim()) {
    sql += ` AND (d.store_name LIKE ? OR d.code LIKE ?)`;
    const q = `%${filters.search.trim()}%`;
    binds.push(q, q);
  }
  return sql;
}

function buildOrderWhere(filters: AdminAnalyticsQuery, range: { startIso: string; endIso: string }, binds: unknown[]) {
  let sql = ` AND o.deleted_at IS NULL AND o.placed_at >= ? AND o.placed_at <= ?`;
  binds.push(range.startIso, range.endIso);
  if (filters.distributorId) {
    sql += ` AND o.distributor_id = ?`;
    binds.push(filters.distributorId);
  }
  if (filters.dealerId) {
    sql += ` AND o.dealer_id = ?`;
    binds.push(filters.dealerId);
  }
  if (filters.salesExecutiveId) {
    sql += ` AND o.dealer_id IN (SELECT id FROM dealers WHERE sales_executive_user_id = ? AND deleted_at IS NULL)`;
    binds.push(filters.salesExecutiveId);
  }
  if (filters.search?.trim()) {
    sql += ` AND (o.id LIKE ? OR EXISTS (SELECT 1 FROM dealers d2 WHERE d2.id = o.dealer_id AND (d2.store_name LIKE ? OR d2.code LIKE ?)))`;
    const q = `%${filters.search.trim()}%`;
    binds.push(q, q, q);
  }
  return sql;
}

function resolveScopeLevel(filters: AdminAnalyticsQuery) {
  if (filters.dealerId) return filters.product ? "product" : "dealer";
  if (filters.salesExecutiveId) return "sales_executive";
  if (filters.distributorId) return "distributor";
  if (filters.product) return "product";
  return "overall";
}

async function buildScopeLabel(db: D1Database, filters: AdminAnalyticsQuery) {
  if (filters.dealerId) {
    const row = await db
      .prepare(`SELECT store_name FROM dealers WHERE id = ?`)
      .bind(filters.dealerId)
      .first<{ store_name: string }>();
    return row?.store_name ?? "Dealer";
  }
  if (filters.salesExecutiveId) {
    const row = await db
      .prepare(`SELECT name FROM users WHERE id = ?`)
      .bind(filters.salesExecutiveId)
      .first<{ name: string }>();
    return row?.name ?? "Sales Executive";
  }
  if (filters.distributorId) {
    const row = await db
      .prepare(`SELECT name FROM distributors WHERE id = ?`)
      .bind(filters.distributorId)
      .first<{ name: string }>();
    return row?.name ?? "Distributor";
  }
  return "Network overview";
}

function buildBreadcrumb(filters: AdminAnalyticsQuery, names: {
  distributor?: string;
  salesExecutive?: string;
  dealer?: string;
}) {
  const crumbs: Array<{ label: string; filters: AdminAnalyticsQuery }> = [
    { label: "Reports", filters: { month: filters.month, fromMonth: filters.fromMonth, toMonth: filters.toMonth } },
  ];
  if (filters.distributorId) {
    crumbs.push({
      label: names.distributor ?? "Distributor",
      filters: { ...filters, salesExecutiveId: undefined, dealerId: undefined, product: undefined },
    });
  }
  if (filters.salesExecutiveId) {
    crumbs.push({
      label: names.salesExecutive ?? "Sales Executive",
      filters: { ...filters, dealerId: undefined, product: undefined },
    });
  }
  if (filters.dealerId) {
    crumbs.push({ label: names.dealer ?? "Dealer", filters: { ...filters, product: undefined } });
  }
  if (filters.product) {
    crumbs.push({ label: filters.product, filters });
  }
  return crumbs;
}

export async function buildAdminAnalyticsFromDb(db: D1Database, raw: AdminAnalyticsQuery = {}) {
  const filters: AdminAnalyticsQuery = { ...raw };
  const range = monthRange(filters);
  const filterOptions = await loadFilterOptions(db, filters);
  const scopeLevel = resolveScopeLevel(filters);
  const scopeLabel = await buildScopeLabel(db, filters);

  const distName = filters.distributorId
    ? filterOptions.distributors.find((d) => d.id === filters.distributorId)?.name
    : undefined;
  const seName = filters.salesExecutiveId
    ? filterOptions.salesExecutives.find((s) => s.id === filters.salesExecutiveId)?.name
    : undefined;
  const dealerName = filters.dealerId
    ? filterOptions.dealers.find((d) => d.id === filters.dealerId)?.name
    : undefined;

  const orderBinds: unknown[] = [];
  const orderWhere = buildOrderWhere(filters, range, orderBinds);

  const summary = await db
    .prepare(
      `SELECT COUNT(*) as orders, COALESCE(SUM(o.total_value), 0) as sales
       FROM orders o WHERE 1=1${orderWhere}`,
    )
    .bind(...orderBinds)
    .first<{ orders: number; sales: number }>();

  const prevStart = new Date(range.startIso);
  prevStart.setMonth(prevStart.getMonth() - 1);
  const prevEnd = new Date(range.endIso);
  prevEnd.setMonth(prevEnd.getMonth() - 1);
  const prevBinds: unknown[] = [];
  const prevWhere = buildOrderWhere(
    filters,
    { startIso: prevStart.toISOString(), endIso: prevEnd.toISOString() },
    prevBinds,
  );
  const prevSummary = await db
    .prepare(
      `SELECT COUNT(*) as orders, COALESCE(SUM(o.total_value), 0) as sales
       FROM orders o WHERE 1=1${prevWhere}`,
    )
    .bind(...prevBinds)
    .first<{ orders: number; sales: number }>();

  const pendingBinds: unknown[] = [];
  let pendingSql = `SELECT COUNT(*) as c FROM orders o JOIN dealers d ON d.id = o.dealer_id
    WHERE o.status IN ('order_placed','pending_approval') AND o.deleted_at IS NULL`;
  pendingSql += buildDealerWhere(filters, pendingBinds);
  const pending = await db.prepare(pendingSql).bind(...pendingBinds).first<{ c: number }>();

  const complaintBinds: unknown[] = [];
  let complaintSql = `SELECT COUNT(*) as c FROM complaints c JOIN dealers d ON d.id = c.dealer_id
    WHERE c.status IN ('pending','in_progress') AND c.deleted_at IS NULL`;
  complaintSql += buildDealerWhere(filters, complaintBinds);
  const complaints = await db.prepare(complaintSql).bind(...complaintBinds).first<{ c: number }>();

  const sales = summary?.sales ?? 0;
  const orders = summary?.orders ?? 0;
  const prevSales = prevSummary?.sales ?? 0;
  const prevOrders = prevSummary?.orders ?? 0;

  const trendBinds: unknown[] = [];
  let trendSql = `SELECT strftime('%Y-%m', o.placed_at) as ym, SUM(o.total_value) as sales, COUNT(*) as orders
    FROM orders o WHERE o.deleted_at IS NULL`;
  const trendStart = new Date();
  trendStart.setMonth(trendStart.getMonth() - 5, 1);
  trendStart.setHours(0, 0, 0, 0);
  trendSql += buildOrderWhere(filters, { startIso: trendStart.toISOString(), endIso: range.endIso }, trendBinds);
  trendSql += ` GROUP BY ym ORDER BY ym ASC LIMIT 6`;
  const { results: trendRows } = await db.prepare(trendSql).bind(...trendBinds).all<{
    ym: string;
    sales: number;
    orders: number;
  }>();

  const salesTrend = trendRows.map((r) => {
    const d = new Date(`${r.ym}-01`);
    return { month: formatMonthLabel(d), sales: r.sales, orders: r.orders };
  });

  let rankingLevel: "distributor" | "sales_executive" | "dealer" | "product" = "distributor";
  let rankingSql = "";
  const rankBinds: unknown[] = [];

  if (filters.dealerId) {
    rankingLevel = "product";
    rankingSql = `SELECT oi.product_name as id, oi.product_name as name, SUM(oi.line_total) as sales, SUM(oi.quantity) as orders
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE 1=1${buildOrderWhere(filters, range, rankBinds)}
      GROUP BY oi.product_name ORDER BY sales DESC LIMIT 10`;
  } else if (filters.salesExecutiveId || filters.distributorId) {
    rankingLevel = "dealer";
    rankingSql = `SELECT d.id, d.store_name as name, d.code as subtitle,
      COALESCE(SUM(o.total_value), 0) as sales, COUNT(o.id) as orders
      FROM dealers d LEFT JOIN orders o ON o.dealer_id = d.id AND o.deleted_at IS NULL
        AND o.placed_at >= ? AND o.placed_at <= ?
      WHERE d.deleted_at IS NULL`;
    rankBinds.push(range.startIso, range.endIso);
    rankingSql += buildDealerWhere(filters, rankBinds);
    rankingSql += ` GROUP BY d.id ORDER BY sales DESC LIMIT 10`;
  } else {
    rankingSql = `SELECT dist.id, dist.name, '' as subtitle,
      COALESCE(SUM(o.total_value), 0) as sales, COUNT(o.id) as orders
      FROM distributors dist LEFT JOIN orders o ON o.distributor_id = dist.id AND o.deleted_at IS NULL
        AND o.placed_at >= ? AND o.placed_at <= ?
      WHERE dist.deleted_at IS NULL GROUP BY dist.id ORDER BY sales DESC LIMIT 10`;
    rankBinds.push(range.startIso, range.endIso);
  }

  const { results: rankRows } = await db.prepare(rankingSql).bind(...rankBinds).all<{
    id: string;
    name: string;
    subtitle?: string;
    sales: number;
    orders: number;
  }>();

  const avgSales = rankRows.length ? rankRows.reduce((s, r) => s + r.sales, 0) / rankRows.length : 0;
  const rankings = {
    level: rankingLevel,
    top: rankRows.slice(0, 5).map((r) => ({
      id: r.id,
      name: r.name,
      subtitle: r.subtitle,
      sales: r.sales,
      orders: r.orders,
      growthPct: 0,
      vsAvgPct: avgSales ? Math.round(((r.sales - avgSales) / avgSales) * 100) : 0,
    })),
    bottom: [...rankRows].reverse().slice(0, 5).map((r) => ({
      id: r.id,
      name: r.name,
      subtitle: r.subtitle,
      sales: r.sales,
      orders: r.orders,
      growthPct: 0,
      vsAvgPct: avgSales ? Math.round(((r.sales - avgSales) / avgSales) * 100) : 0,
    })),
  };

  const shareBinds: unknown[] = [range.startIso, range.endIso];
  const { results: shareRows } = await db
    .prepare(
      `SELECT dist.id, dist.name, COALESCE(SUM(o.total_value), 0) as value
       FROM distributors dist LEFT JOIN orders o ON o.distributor_id = dist.id AND o.deleted_at IS NULL
         AND o.placed_at >= ? AND o.placed_at <= ?
       WHERE dist.deleted_at IS NULL GROUP BY dist.id ORDER BY value DESC`,
    )
    .bind(...shareBinds)
    .all<{ id: string; name: string; value: number }>();
  const shareTotal = shareRows.reduce((s, r) => s + r.value, 0) || 1;
  const distributorShare = shareRows.map((r) => ({
    id: r.id,
    name: r.name,
    value: r.value,
    pct: Math.round((r.value / shareTotal) * 100),
  }));

  const productBinds: unknown[] = [];
  const { results: productRows } = await db
    .prepare(
      `SELECT oi.product_name as product, SUM(oi.line_total) as sales, SUM(oi.quantity) as units
       FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE 1=1${buildOrderWhere(filters, range, productBinds)}
       GROUP BY oi.product_name ORDER BY sales DESC LIMIT 8`,
    )
    .bind(...productBinds)
    .all<{ product: string; sales: number; units: number }>();

  const rewardStatsRow = await db
    .prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending FROM reward_claims`)
    .first<{ total: number; pending: number }>();

  const insights: Array<{
    id: string;
    severity: "critical" | "warning" | "positive";
    entityType: "dealer" | "distributor" | "network";
    entityId: string;
    title: string;
    body: string;
    drillDown?: AdminAnalyticsQuery;
  }> = [];

  if ((pending?.c ?? 0) > 0) {
    insights.push({
      id: "pending-orders",
      severity: "warning",
      entityType: "network",
      entityId: "network",
      title: `${pending?.c} orders awaiting approval`,
      body: "Review pending orders to avoid dealer delays.",
      drillDown: { ...filters, month: filters.month },
    });
  }
  const weak = rankings.bottom.filter((r) => r.sales === 0);
  for (const row of weak.slice(0, 2)) {
    insights.push({
      id: `weak-${row.id}`,
      severity: "critical",
      entityType: rankingLevel === "dealer" ? "dealer" : "distributor",
      entityId: row.id,
      title: `${row.name} — no sales this period`,
      body: "Follow up with this account or check assignment coverage.",
      drillDown:
        rankingLevel === "dealer"
          ? { ...filters, dealerId: row.id }
          : { ...filters, distributorId: row.id },
    });
  }
  const top = rankings.top[0];
  if (top && top.sales > 0) {
    insights.push({
      id: `top-${top.id}`,
      severity: "positive",
      entityType: rankingLevel === "dealer" ? "dealer" : "distributor",
      entityId: top.id,
      title: `${top.name} leads with ${inrCompact(top.sales)}`,
      body: `${top.orders} orders in the selected period.`,
      drillDown:
        rankingLevel === "dealer"
          ? { ...filters, dealerId: top.id }
          : { ...filters, distributorId: top.id },
    });
  }

  const isEmpty = sales === 0 && orders === 0 && rankRows.length === 0;

  return {
    filters,
    scopeLevel,
    scopeLabel,
    breadcrumb: buildBreadcrumb(filters, {
      distributor: distName,
      salesExecutive: seName,
      dealer: dealerName,
    }),
    isEmpty,
    kpis: [
      {
        id: "sales",
        label: "Sales",
        value: sales,
        formatted: inrCompact(sales),
        mom: deltaMetric(sales, prevSales),
      },
      {
        id: "orders",
        label: "Orders",
        value: orders,
        formatted: String(orders),
        mom: deltaMetric(orders, prevOrders),
      },
      {
        id: "pending_approvals",
        label: "Pending approvals",
        value: pending?.c ?? 0,
        formatted: String(pending?.c ?? 0),
      },
      {
        id: "complaints",
        label: "Open complaints",
        value: complaints?.c ?? 0,
        formatted: String(complaints?.c ?? 0),
      },
    ],
    insights,
    salesTrend,
    rankings,
    distributorShare,
    dealerScatter: rankings.top.map((r) => ({
      id: r.id,
      name: r.name,
      orders: r.orders,
      sales: r.sales,
      vsAvgSalesPct: r.vsAvgPct ?? 0,
    })),
    productPerformance: productRows.map((p) => ({
      product: p.product,
      sales: p.sales,
      units: p.units,
      growthPct: 0,
    })),
    productTrends: [],
    campaigns: [],
    rewardClaimsByMonth: [],
    rewardStats: {
      totalClaims: rewardStatsRow?.total ?? 0,
      pendingClaims: rewardStatsRow?.pending ?? 0,
      pointsOutstanding: 0,
    },
    complaintTrend: [],
    approvalTrend: [],
    filterOptions,
  };
}

export async function exploreAdminHierarchy(
  db: D1Database,
  query: {
    level?: "distributors" | "dealers" | "orders";
    distributorId?: string;
    dealerId?: string;
    search?: string;
    from?: string;
    to?: string;
  },
) {
  const level = query.level ?? "distributors";
  const from = query.from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const to = query.to ?? new Date().toISOString();
  const search = query.search?.trim();
  const q = search ? `%${search}%` : null;

  if (level === "distributors") {
    const binds: unknown[] = [from, to];
    let sql = `SELECT dist.id, dist.name, COALESCE(SUM(o.total_value),0) as sales, COUNT(o.id) as orders,
      (SELECT COUNT(*) FROM dealers d WHERE d.distributor_id = dist.id AND d.deleted_at IS NULL) as dealerCount
      FROM distributors dist LEFT JOIN orders o ON o.distributor_id = dist.id AND o.deleted_at IS NULL
        AND o.placed_at >= ? AND o.placed_at <= ?
      WHERE dist.deleted_at IS NULL`;
    if (q) {
      sql += ` AND dist.name LIKE ?`;
      binds.push(q);
    }
    sql += ` GROUP BY dist.id ORDER BY sales DESC`;
    const { results } = await db.prepare(sql).bind(...binds).all();
    return { level, items: results };
  }

  if (level === "dealers") {
    if (!query.distributorId) return { level, items: [] };
    const binds: unknown[] = [from, to, query.distributorId];
    let sql = `SELECT d.id, d.store_name as name, d.code as code,
      COALESCE(SUM(o.total_value),0) as sales, COUNT(o.id) as orders
      FROM dealers d LEFT JOIN orders o ON o.dealer_id = d.id AND o.deleted_at IS NULL
        AND o.placed_at >= ? AND o.placed_at <= ?
      WHERE d.deleted_at IS NULL AND d.distributor_id = ?`;
    if (q) {
      sql += ` AND (d.store_name LIKE ? OR d.code LIKE ?)`;
      binds.push(q, q);
    }
    sql += ` GROUP BY d.id ORDER BY sales DESC`;
    const { results } = await db.prepare(sql).bind(...binds).all();
    return { level, items: results };
  }

  if (!query.dealerId) return { level, items: [] };
  const binds: unknown[] = [query.dealerId, from, to];
  let sql = `SELECT o.id, o.placed_at as placedAt, o.status, o.total_value as value, o.total_items as quantity
    FROM orders o WHERE o.dealer_id = ? AND o.deleted_at IS NULL AND o.placed_at >= ? AND o.placed_at <= ?`;
  if (q) {
    sql += ` AND o.id LIKE ?`;
    binds.push(q);
  }
  sql += ` ORDER BY o.placed_at DESC LIMIT 100`;
  const { results } = await db.prepare(sql).bind(...binds).all();
  return { level, items: results };
}
