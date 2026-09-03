import { formatInLabel, formatYearMonthLabel, id, nowIso, normalizePhone } from "../utils";
import { writeAuditLog } from "./audit";
import { notifyDealerVisitCheckIn } from "./notification-events";

export type DealerVisitRow = {
  id: string;
  salesExecutiveUserId: string;
  salesExecutiveName?: string;
  dealerName: string;
  storeName: string;
  address: string;
  mobile: string;
  dealerId?: string;
  status: "active" | "completed";
  checkInAt: string;
  checkOutAt?: string;
  checkInLat?: number;
  checkInLng?: number;
  checkOutLat?: number;
  checkOutLng?: number;
  notes?: string;
  durationMinutes?: number;
};

type CheckInInput = {
  dealerId?: string;
  dealerName?: string;
  storeName?: string;
  address?: string;
  mobile?: string;
  lat?: number | null;
  lng?: number | null;
};

type CheckOutInput = {
  notes: string;
  lat?: number | null;
  lng?: number | null;
};

type ResolvedCheckInFields = {
  dealerName: string;
  storeName: string;
  address: string;
  mobile: string;
  dealerId?: string;
};

async function resolveCheckInFields(
  db: D1Database,
  input: CheckInInput,
  salesExecutiveUserId: string,
): Promise<ResolvedCheckInFields> {
  const dealerId = input.dealerId?.trim();
  if (dealerId) {
    const dealer = await db
      .prepare(
        `SELECT id, store_name, contact_name, address, location, phone
         FROM dealers
         WHERE id = ? AND deleted_at IS NULL AND sales_executive_user_id = ?`,
      )
      .bind(dealerId, salesExecutiveUserId)
      .first<{
        id: string;
        store_name: string;
        contact_name: string | null;
        address: string | null;
        location: string | null;
        phone: string;
      }>();
    if (!dealer) throw new Error("Store not found or not assigned to you");
    const address = (dealer.address ?? dealer.location ?? "").trim();
    if (!address || address.length < 5) throw new Error("Store address is missing in records");
    const mobile = dealer.phone?.trim();
    if (!mobile || mobile.replace(/\D/g, "").length < 10) {
      throw new Error("Store mobile number is missing in records");
    }
    const storeName = dealer.store_name.trim();
    const dealerName = (dealer.contact_name ?? storeName).trim();
    return {
      dealerId: dealer.id,
      dealerName,
      storeName,
      address,
      mobile: normalizePhone(mobile),
    };
  }

  const storeName = input.storeName?.trim();
  const address = input.address?.trim();
  const mobile = input.mobile?.trim();
  if (!storeName || storeName.length < 2) throw new Error("Store name is required");
  if (!address || address.length < 5) throw new Error("Address is required");
  if (!mobile || mobile.replace(/\D/g, "").length < 10) throw new Error("Valid mobile number is required");
  return {
    storeName,
    address,
    mobile: normalizePhone(mobile),
    dealerName: storeName,
  };
}

function mapRow(r: Record<string, unknown>): DealerVisitRow {
  const checkInAt = r.check_in_at as string;
  const checkOutAt = (r.check_out_at as string) ?? undefined;
  let durationMinutes: number | undefined;
  if (checkOutAt) {
    durationMinutes = Math.max(
      0,
      Math.round((new Date(checkOutAt).getTime() - new Date(checkInAt).getTime()) / 60000),
    );
  }
  return {
    id: r.id as string,
    salesExecutiveUserId: r.sales_executive_user_id as string,
    salesExecutiveName: (r.sales_executive_name as string) ?? undefined,
    dealerName: r.dealer_name as string,
    storeName: r.store_name as string,
    address: r.address as string,
    mobile: r.mobile as string,
    dealerId: (r.dealer_id as string) ?? undefined,
    status: r.status as "active" | "completed",
    checkInAt: formatInLabel(checkInAt),
    checkOutAt: checkOutAt ? formatInLabel(checkOutAt) : undefined,
    checkInLat: r.check_in_lat != null ? Number(r.check_in_lat) : undefined,
    checkInLng: r.check_in_lng != null ? Number(r.check_in_lng) : undefined,
    checkOutLat: r.check_out_lat != null ? Number(r.check_out_lat) : undefined,
    checkOutLng: r.check_out_lng != null ? Number(r.check_out_lng) : undefined,
    notes: (r.notes as string) ?? undefined,
    durationMinutes,
  };
}

const SELECT_FIELDS = `v.*, u.name as sales_executive_name`;

export async function getActiveVisit(db: D1Database, salesExecutiveUserId: string) {
  const row = await db
    .prepare(
      `SELECT ${SELECT_FIELDS}
       FROM dealer_visits v
       JOIN users u ON u.id = v.sales_executive_user_id
       WHERE v.sales_executive_user_id = ? AND v.status = 'active'
       ORDER BY v.check_in_at DESC LIMIT 1`,
    )
    .bind(salesExecutiveUserId)
    .first<Record<string, unknown>>();
  return row ? mapRow(row) : null;
}

export async function checkInVisit(
  db: D1Database,
  salesExecutiveUserId: string,
  input: CheckInInput,
  actorUserId: string,
) {
  const fields = await resolveCheckInFields(db, input, salesExecutiveUserId);

  const active = await getActiveVisit(db, salesExecutiveUserId);
  if (active) throw new Error("You already have an active visit. Please check out first.");

  const visitId = id("VIS");
  const ts = nowIso();

  try {
    await db
      .prepare(
        `INSERT INTO dealer_visits (
          id, sales_executive_user_id, dealer_id, dealer_name, store_name, address, mobile,
          status, check_in_at, check_in_lat, check_in_lng, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
      )
      .bind(
        visitId,
        salesExecutiveUserId,
        fields.dealerId ?? null,
        fields.dealerName,
        fields.storeName,
        fields.address,
        fields.mobile,
        ts,
        input.lat ?? null,
        input.lng ?? null,
        ts,
        ts,
      )
      .run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("UNIQUE")) throw new Error("You already have an active visit. Please check out first.");
    throw err;
  }

  await writeAuditLog(db, {
    actorUserId,
    action: "visit.check_in",
    entityType: "dealer_visit",
    entityId: visitId,
    after: { ...fields, checkInAt: ts },
  });

  const se = await db
    .prepare(`SELECT name FROM users WHERE id = ?`)
    .bind(salesExecutiveUserId)
    .first<{ name: string }>();

  await notifyDealerVisitCheckIn(db, {
    visitId,
    salesExecutiveName: se?.name ?? "Sales executive",
    storeName: fields.storeName,
    dealerName: fields.dealerName,
  });

  return (await getVisitById(db, visitId, salesExecutiveUserId))!;
}

export async function checkOutVisit(
  db: D1Database,
  visitId: string,
  salesExecutiveUserId: string,
  input: CheckOutInput,
  actorUserId: string,
) {
  const notes = input.notes?.trim();
  if (!notes || notes.length < 5) throw new Error("Visit notes are required (minimum 5 characters)");

  const row = await db
    .prepare(`SELECT * FROM dealer_visits WHERE id = ?`)
    .bind(visitId)
    .first<Record<string, unknown>>();
  if (!row) throw new Error("Visit not found");
  if (row.sales_executive_user_id !== salesExecutiveUserId) throw new Error("Forbidden");
  if (row.status !== "active") throw new Error("Visit is already completed");

  const ts = nowIso();
  await db
    .prepare(
      `UPDATE dealer_visits SET
        status = 'completed', check_out_at = ?, check_out_lat = ?, check_out_lng = ?,
        notes = ?, updated_at = ?
       WHERE id = ? AND status = 'active'`,
    )
    .bind(ts, input.lat ?? null, input.lng ?? null, notes, ts, visitId)
    .run();

  await writeAuditLog(db, {
    actorUserId,
    action: "visit.check_out",
    entityType: "dealer_visit",
    entityId: visitId,
    before: { status: "active" },
    after: { status: "completed", checkOutAt: ts, notes },
  });

  return (await getVisitById(db, visitId, salesExecutiveUserId))!;
}

export async function getVisitById(
  db: D1Database,
  visitId: string,
  salesExecutiveUserId?: string,
  distributorId?: string,
) {
  let sql = `SELECT ${SELECT_FIELDS}
       FROM dealer_visits v
       JOIN users u ON u.id = v.sales_executive_user_id
       WHERE v.id = ?`;
  const binds: unknown[] = [visitId];
  if (salesExecutiveUserId) {
    sql += ` AND v.sales_executive_user_id = ?`;
    binds.push(salesExecutiveUserId);
  }
  if (distributorId) {
    sql += ` AND (
      v.dealer_id IN (SELECT id FROM dealers WHERE distributor_id = ? AND deleted_at IS NULL)
      OR v.sales_executive_user_id IN (
        SELECT DISTINCT sales_executive_user_id FROM dealers
        WHERE distributor_id = ? AND sales_executive_user_id IS NOT NULL AND deleted_at IS NULL
      )
    )`;
    binds.push(distributorId, distributorId);
  }
  const row = await db.prepare(sql).bind(...binds).first<Record<string, unknown>>();
  return row ? mapRow(row) : null;
}

export type ListVisitsOptions = {
  salesExecutiveUserId?: string;
  dealerId?: string;
  distributorId?: string;
  status?: "active" | "completed" | "all";
  fromDate?: string;
  toDate?: string;
  search?: string;
  page?: number;
  pageSize?: number;
};

export async function listVisits(db: D1Database, opts: ListVisitsOptions = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 20));
  const binds: unknown[] = [];
  let where = " WHERE 1=1";

  if (opts.salesExecutiveUserId) {
    where += ` AND v.sales_executive_user_id = ?`;
    binds.push(opts.salesExecutiveUserId);
  }
  if (opts.dealerId) {
    where += ` AND v.dealer_id = ?`;
    binds.push(opts.dealerId);
  }
  if (opts.distributorId) {
    where += ` AND (
      v.dealer_id IN (SELECT id FROM dealers WHERE distributor_id = ? AND deleted_at IS NULL)
      OR v.sales_executive_user_id IN (
        SELECT DISTINCT sales_executive_user_id FROM dealers
        WHERE distributor_id = ? AND sales_executive_user_id IS NOT NULL AND deleted_at IS NULL
      )
    )`;
    binds.push(opts.distributorId, opts.distributorId);
  }
  if (opts.status && opts.status !== "all") {
    where += ` AND v.status = ?`;
    binds.push(opts.status);
  }
  if (opts.fromDate) {
    where += ` AND v.check_in_at >= ?`;
    binds.push(`${opts.fromDate}T00:00:00.000Z`);
  }
  if (opts.toDate) {
    where += ` AND v.check_in_at <= ?`;
    binds.push(`${opts.toDate}T23:59:59.999Z`);
  }
  if (opts.search?.trim()) {
    where += ` AND (v.dealer_name LIKE ? OR v.store_name LIKE ? OR v.mobile LIKE ? OR u.name LIKE ?)`;
    const q = `%${opts.search.trim()}%`;
    binds.push(q, q, q, q);
  }

  const countRow = await db
    .prepare(
      `SELECT COUNT(*) as c FROM dealer_visits v JOIN users u ON u.id = v.sales_executive_user_id${where}`,
    )
    .bind(...binds)
    .first<{ c: number }>();

  const { results } = await db
    .prepare(
      `SELECT ${SELECT_FIELDS}
       FROM dealer_visits v
       JOIN users u ON u.id = v.sales_executive_user_id
       ${where}
       ORDER BY v.check_in_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...binds, pageSize, (page - 1) * pageSize)
    .all<Record<string, unknown>>();

  const total = countRow?.c ?? 0;
  return {
    items: results.map(mapRow),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getVisitSummary(
  db: D1Database,
  opts: { fromDate?: string; toDate?: string; salesExecutiveUserId?: string; distributorId?: string } = {},
) {
  const binds: unknown[] = [];
  let where = "";
  if (opts.fromDate) {
    where += ` AND v.check_in_at >= ?`;
    binds.push(`${opts.fromDate}T00:00:00.000Z`);
  }
  if (opts.toDate) {
    where += ` AND v.check_in_at <= ?`;
    binds.push(`${opts.toDate}T23:59:59.999Z`);
  }
  if (opts.salesExecutiveUserId) {
    where += ` AND v.sales_executive_user_id = ?`;
    binds.push(opts.salesExecutiveUserId);
  }
  if (opts.distributorId) {
    where += ` AND (
      v.dealer_id IN (SELECT id FROM dealers WHERE distributor_id = ? AND deleted_at IS NULL)
      OR v.sales_executive_user_id IN (
        SELECT DISTINCT sales_executive_user_id FROM dealers
        WHERE distributor_id = ? AND sales_executive_user_id IS NOT NULL AND deleted_at IS NULL
      )
    )`;
    binds.push(opts.distributorId, opts.distributorId);
  }

  const totals = await db
    .prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN v.status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN v.status = 'active' THEN 1 ELSE 0 END) as active
       FROM dealer_visits v WHERE 1=1${where}`,
    )
    .bind(...binds)
    .first<{ total: number; completed: number; active: number }>();

  const { results: bySe } = await db
    .prepare(
      `SELECT u.id, u.name, COUNT(*) as visits,
        SUM(CASE WHEN v.status = 'completed' THEN 1 ELSE 0 END) as completed
       FROM dealer_visits v
       JOIN users u ON u.id = v.sales_executive_user_id
       WHERE 1=1${where}
       GROUP BY u.id ORDER BY visits DESC`,
    )
    .bind(...binds)
    .all<{ id: string; name: string; visits: number; completed: number }>();

  const trendBinds = [...binds];
  const { results: trend } = await db
    .prepare(
      `SELECT strftime('%Y-%m', v.check_in_at) as ym,
        COUNT(*) as total,
        SUM(CASE WHEN v.status = 'completed' THEN 1 ELSE 0 END) as completed
       FROM dealer_visits v WHERE 1=1${where}
       GROUP BY ym ORDER BY ym ASC LIMIT 6`,
    )
    .bind(...trendBinds)
    .all<{ ym: string; total: number; completed: number }>();

  const uniqueStoresRow = await db
    .prepare(
      `SELECT COUNT(DISTINCT COALESCE(v.dealer_id, v.store_name)) as c
       FROM dealer_visits v WHERE 1=1${where}`,
    )
    .bind(...binds)
    .first<{ c: number }>();

  const { results: byStoreRows } = await db
    .prepare(
      `SELECT
        v.dealer_id,
        v.store_name,
        COUNT(*) as visits,
        SUM(CASE WHEN v.status = 'completed' THEN 1 ELSE 0 END) as completed,
        ROUND(AVG(
          CASE WHEN v.check_out_at IS NOT NULL
            THEN (julianday(v.check_out_at) - julianday(v.check_in_at)) * 24 * 60
            ELSE NULL END
        )) as avg_duration_minutes,
        MAX(v.check_in_at) as last_visit_at
       FROM dealer_visits v WHERE 1=1${where}
       GROUP BY COALESCE(v.dealer_id, v.store_name), v.store_name
       ORDER BY visits DESC, v.store_name ASC
       LIMIT 50`,
    )
    .bind(...binds)
    .all<{
      dealer_id: string | null;
      store_name: string;
      visits: number;
      completed: number;
      avg_duration_minutes: number | null;
      last_visit_at: string;
    }>();

  return {
    total: totals?.total ?? 0,
    completed: totals?.completed ?? 0,
    active: totals?.active ?? 0,
    uniqueStores: uniqueStoresRow?.c ?? 0,
    bySalesExecutive: bySe.map((r) => ({
      id: r.id,
      name: r.name,
      visits: r.visits,
      completed: r.completed,
    })),
    byStore: byStoreRows.map((r) => ({
      dealerId: r.dealer_id ?? undefined,
      storeName: r.store_name,
      visits: r.visits,
      completed: r.completed,
      avgDurationMinutes: r.avg_duration_minutes ?? undefined,
      lastVisitAt: formatInLabel(r.last_visit_at),
    })),
    monthlyTrend: trend.map((r) => ({
      month: formatYearMonthLabel(r.ym),
      total: r.total,
      completed: r.completed,
    })),
  };
}
