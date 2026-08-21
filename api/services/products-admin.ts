import { id, nowIso } from "../utils";
import { writeAuditLog } from "./audit";

export type AdminProductRow = {
  id: string;
  name: string;
  category: string;
  guarantee: string;
  thicknesses: string[];
  fixedSize?: string;
  mrp: number;
  dealerPrice: number;
  points: number;
  rewardPercent: number;
  rewardEligibility: "dealer" | "distributor" | "both";
  rewardRuleActive: boolean;
  freeItems?: string;
  blurb: string;
  image: string;
  status: "active" | "archived";
  sortOrder: number;
};

export type ProductFilters = {
  search?: string;
  category?: string;
  status?: "active" | "archived" | "all";
  page?: number;
  pageSize?: number;
};

export type ProductInput = {
  id?: string;
  name: string;
  category: string;
  guarantee: string;
  thicknesses?: string[];
  fixedSize?: string | null;
  mrp: number;
  dealerPrice: number;
  points?: number;
  rewardPercent?: number;
  rewardEligibility?: "dealer" | "distributor" | "both";
  rewardRuleActive?: boolean;
  freeItems?: string | null;
  blurb?: string;
  image?: string;
  sortOrder?: number;
};

async function loadProduct(db: D1Database, productId: string): Promise<AdminProductRow | null> {
  const product = await db
    .prepare(`SELECT * FROM products WHERE id = ? AND deleted_at IS NULL`)
    .bind(productId)
    .first<Record<string, unknown>>();
  if (!product) return null;

  const thicknesses = await db
    .prepare(`SELECT thickness FROM product_thicknesses WHERE product_id = ? ORDER BY sort_order, thickness`)
    .bind(productId)
    .all<{ thickness: string }>();

  const price = await db
    .prepare(
      `SELECT * FROM product_prices WHERE product_id = ? ORDER BY effective_from DESC LIMIT 1`,
    )
    .bind(productId)
    .first<Record<string, unknown>>();

  const active = Boolean(product.active);
  return {
    id: product.id as string,
    name: product.name as string,
    category: product.category as string,
    guarantee: product.guarantee as string,
    thicknesses: thicknesses.results.map((t) => t.thickness),
    fixedSize: (product.fixed_size as string) ?? undefined,
    mrp: (price?.mrp as number) ?? 0,
    dealerPrice: (price?.dealer_price as number) ?? 0,
    points: (price?.points as number) ?? 0,
    rewardPercent: (price?.reward_percent as number) ?? 0,
    rewardEligibility: ((price?.reward_eligibility as string) ?? "dealer") as AdminProductRow["rewardEligibility"],
    rewardRuleActive: active,
    freeItems: (price?.free_items_label as string) ?? undefined,
    blurb: (product.blurb as string) ?? "",
    image: (product.image_url as string) ?? "",
    status: active ? "active" : "archived",
    sortOrder: (product.sort_order as number) ?? 0,
  };
}

export async function listAdminProducts(db: D1Database, filters: ProductFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  let sql = `SELECT p.* FROM products p WHERE p.deleted_at IS NULL`;
  const binds: unknown[] = [];

  if (filters.status === "active") {
    sql += ` AND p.active = 1`;
  } else if (filters.status === "archived") {
    sql += ` AND p.active = 0`;
  }
  if (filters.category && filters.category !== "all") {
    sql += ` AND p.category = ?`;
    binds.push(filters.category);
  }
  if (filters.search?.trim()) {
    const q = `%${filters.search.trim()}%`;
    sql += ` AND (p.name LIKE ? OR p.category LIKE ? OR p.guarantee LIKE ?)`;
    binds.push(q, q, q);
  }

  const countRow = await db
    .prepare(`SELECT COUNT(*) as c FROM (${sql})`)
    .bind(...binds)
    .first<{ c: number }>();

  sql += ` ORDER BY p.sort_order ASC, p.name ASC LIMIT ? OFFSET ?`;
  binds.push(pageSize, offset);

  const { results } = await db.prepare(sql).bind(...binds).all();
  const items: AdminProductRow[] = [];
  for (const row of results) {
    const product = await loadProduct(db, row.id as string);
    if (product) items.push(product);
  }

  const total = countRow?.c ?? 0;
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getAdminProduct(db: D1Database, productId: string) {
  return loadProduct(db, productId);
}

async function upsertThicknesses(db: D1Database, productId: string, thicknesses: string[]) {
  await db.prepare(`DELETE FROM product_thicknesses WHERE product_id = ?`).bind(productId).run();
  let sort = 0;
  for (const thickness of thicknesses) {
    if (!thickness.trim()) continue;
    await db
      .prepare(
        `INSERT INTO product_thicknesses (product_id, thickness, sort_order) VALUES (?, ?, ?)`,
      )
      .bind(productId, thickness.trim(), sort++)
      .run();
  }
}

async function upsertPrice(db: D1Database, productId: string, input: ProductInput) {
  const existing = await db
    .prepare(`SELECT id FROM product_prices WHERE product_id = ? ORDER BY effective_from DESC LIMIT 1`)
    .bind(productId)
    .first<{ id: number }>();

  const rewardPercent =
    input.rewardPercent ??
    (input.mrp > 0 ? Math.round(((input.points ?? 0) / input.mrp) * 1000) / 10 : 0);

  if (existing) {
    await db
      .prepare(
        `UPDATE product_prices SET mrp = ?, dealer_price = ?, points = ?, reward_percent = ?, reward_eligibility = ?, free_items_label = ?
         WHERE id = ?`,
      )
      .bind(
        input.mrp,
        input.dealerPrice,
        input.points ?? 0,
        rewardPercent,
        input.rewardEligibility ?? "dealer",
        input.freeItems ?? null,
        existing.id,
      )
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO product_prices (product_id, mrp, dealer_price, points, reward_percent, reward_eligibility, free_items_label)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        productId,
        input.mrp,
        input.dealerPrice,
        input.points ?? 0,
        rewardPercent,
        input.rewardEligibility ?? "dealer",
        input.freeItems ?? null,
      )
      .run();
  }
}

export async function createAdminProduct(db: D1Database, input: ProductInput, actorUserId: string) {
  if (!input.name?.trim()) throw new Error("Product name is required");

  const productId = input.id ?? id("prod");
  const ts = nowIso();
  const sortOrder =
    input.sortOrder ??
    ((await db.prepare(`SELECT COALESCE(MAX(sort_order), 0) + 1 as n FROM products`).first<{ n: number }>())?.n ??
      1);

  await db
    .prepare(
      `INSERT INTO products (id, name, category, guarantee, fixed_size, blurb, image_url, sort_order, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .bind(
      productId,
      input.name.trim(),
      input.category,
      input.guarantee,
      input.fixedSize ?? null,
      input.blurb ?? "",
      input.image ?? "",
      sortOrder,
      ts,
      ts,
    )
    .run();

  await upsertThicknesses(db, productId, input.thicknesses ?? []);
  await upsertPrice(db, productId, input);

  const created = await loadProduct(db, productId);
  await writeAuditLog(db, {
    actorUserId,
    action: "product.create",
    entityType: "product",
    entityId: productId,
    after: created,
  });
  return created!;
}

export async function updateAdminProduct(
  db: D1Database,
  productId: string,
  input: ProductInput,
  actorUserId: string,
) {
  const before = await loadProduct(db, productId);
  if (!before) throw new Error("Product not found");

  const ts = nowIso();
  await db
    .prepare(
      `UPDATE products SET name = ?, category = ?, guarantee = ?, fixed_size = ?, blurb = ?, image_url = ?, sort_order = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(
      input.name.trim(),
      input.category,
      input.guarantee,
      input.fixedSize ?? null,
      input.blurb ?? "",
      input.image ?? "",
      input.sortOrder ?? before.sortOrder,
      ts,
      productId,
    )
    .run();

  if (input.thicknesses) await upsertThicknesses(db, productId, input.thicknesses);
  await upsertPrice(db, productId, input);

  const after = await loadProduct(db, productId);
  await writeAuditLog(db, {
    actorUserId,
    action: "product.update",
    entityType: "product",
    entityId: productId,
    before,
    after,
  });
  return after!;
}

export async function archiveAdminProduct(db: D1Database, productId: string, actorUserId: string) {
  const before = await loadProduct(db, productId);
  if (!before) throw new Error("Product not found");

  await db
    .prepare(`UPDATE products SET active = 0, updated_at = ? WHERE id = ?`)
    .bind(nowIso(), productId)
    .run();

  const after = await loadProduct(db, productId);
  await writeAuditLog(db, {
    actorUserId,
    action: "product.archive",
    entityType: "product",
    entityId: productId,
    before,
    after,
  });
  return after!;
}

export async function restoreAdminProduct(db: D1Database, productId: string, actorUserId: string) {
  const before = await loadProduct(db, productId);
  if (!before) throw new Error("Product not found");

  await db
    .prepare(`UPDATE products SET active = 1, updated_at = ? WHERE id = ?`)
    .bind(nowIso(), productId)
    .run();

  const after = await loadProduct(db, productId);
  await writeAuditLog(db, {
    actorUserId,
    action: "product.restore",
    entityType: "product",
    entityId: productId,
    before,
    after,
  });
  return after!;
}

export async function listProductCategories(db: D1Database) {
  const { results } = await db
    .prepare(`SELECT DISTINCT category FROM products WHERE deleted_at IS NULL ORDER BY category`)
    .all<{ category: string }>();
  return results.map((r) => r.category);
}
