import { nowIso } from "../utils";
import { writeAuditLog } from "./audit";
import {
  notifyDealerUsers,
  notifyDistributorsForOrg,
  notifySalesExecutive,
  withNotificationI18n,
} from "./notification-events";

export type AssignmentRow = {
  id: string;
  name: string;
  code: string;
  location: string;
  distributorId: string | null;
  distributorName: string | null;
  salesExecutiveUserId: string | null;
  salesExecutiveName: string | null;
  active: boolean;
};

export type AssignmentFilters = {
  search?: string;
  distributorId?: string;
  salesExecutiveUserId?: string;
  unassigned?: "distributor" | "sales_executive" | "any";
  page?: number;
  pageSize?: number;
};

export type AssignmentPatch = {
  distributorId?: string | null;
  salesExecutiveUserId?: string | null;
};

async function getDealerSnapshot(db: D1Database, dealerId: string) {
  return db
    .prepare(
      `SELECT d.id, d.distributor_id, d.sales_executive_user_id, d.store_name, d.code,
              dist.name as distributor_name, se.name as sales_executive_name
       FROM dealers d
       LEFT JOIN distributors dist ON dist.id = d.distributor_id
       LEFT JOIN users se ON se.id = d.sales_executive_user_id
       WHERE d.id = ? AND d.deleted_at IS NULL`,
    )
    .bind(dealerId)
    .first<{
      id: string;
      distributor_id: string | null;
      sales_executive_user_id: string | null;
      store_name: string;
      code: string;
      distributor_name: string | null;
      sales_executive_name: string | null;
    }>();
}

function mapRow(r: Record<string, unknown>): AssignmentRow {
  return {
    id: r.id as string,
    name: r.store_name as string,
    code: r.code as string,
    location: r.location as string,
    distributorId: (r.distributor_id as string) ?? null,
    distributorName: (r.distributor_name as string) ?? null,
    salesExecutiveUserId: (r.sales_executive_user_id as string) ?? null,
    salesExecutiveName: (r.sales_executive_name as string) ?? null,
    active: Boolean(r.active),
  };
}

export async function listAssignmentRows(db: D1Database, filters: AssignmentFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  let sql = `
    SELECT d.*, dist.name as distributor_name, se.name as sales_executive_name
    FROM dealers d
    LEFT JOIN distributors dist ON dist.id = d.distributor_id
    LEFT JOIN users se ON se.id = d.sales_executive_user_id
    WHERE d.deleted_at IS NULL`;
  const binds: unknown[] = [];

  if (filters.distributorId) {
    sql += ` AND d.distributor_id = ?`;
    binds.push(filters.distributorId);
  }
  if (filters.salesExecutiveUserId) {
    sql += ` AND d.sales_executive_user_id = ?`;
    binds.push(filters.salesExecutiveUserId);
  }
  if (filters.unassigned === "distributor") {
    sql += ` AND d.distributor_id IS NULL`;
  } else if (filters.unassigned === "sales_executive") {
    sql += ` AND d.sales_executive_user_id IS NULL`;
  } else if (filters.unassigned === "any") {
    sql += ` AND (d.distributor_id IS NULL OR d.sales_executive_user_id IS NULL)`;
  }
  if (filters.search?.trim()) {
    const q = `%${filters.search.trim()}%`;
    sql += ` AND (d.store_name LIKE ? OR d.code LIKE ? OR d.location LIKE ?)`;
    binds.push(q, q, q);
  }

  const countRow = await db
    .prepare(`SELECT COUNT(*) as c FROM (${sql})`)
    .bind(...binds)
    .first<{ c: number }>();

  sql += ` ORDER BY d.store_name ASC LIMIT ? OFFSET ?`;
  binds.push(pageSize, offset);

  const { results } = await db.prepare(sql).bind(...binds).all();
  const total = countRow?.c ?? 0;

  return {
    items: results.map(mapRow),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getAssignmentSummary(db: D1Database) {
  const distributors = await db
    .prepare(
      `SELECT dist.id, dist.name, COUNT(d.id) as dealer_count
       FROM distributors dist
       LEFT JOIN dealers d ON d.distributor_id = dist.id AND d.deleted_at IS NULL
       WHERE dist.deleted_at IS NULL
       GROUP BY dist.id
       ORDER BY dist.name`,
    )
    .all<{ id: string; name: string; dealer_count: number }>();

  const salesExecutives = await db
    .prepare(
      `SELECT u.id, u.name, COUNT(d.id) as dealer_count
       FROM users u
       LEFT JOIN dealers d ON d.sales_executive_user_id = u.id AND d.deleted_at IS NULL
       WHERE u.role = 'sales_executive' AND u.deleted_at IS NULL AND u.status = 'active'
       GROUP BY u.id
       ORDER BY u.name`,
    )
    .all<{ id: string; name: string; dealer_count: number }>();

  const unassigned = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN distributor_id IS NULL THEN 1 ELSE 0 END) as unassigned_distributor,
         SUM(CASE WHEN sales_executive_user_id IS NULL THEN 1 ELSE 0 END) as unassigned_sales_executive
       FROM dealers WHERE deleted_at IS NULL`,
    )
    .first<{ unassigned_distributor: number; unassigned_sales_executive: number }>();

  return {
    distributors: distributors.results.map((r) => ({
      id: r.id,
      name: r.name,
      dealerCount: r.dealer_count,
    })),
    salesExecutives: salesExecutives.results.map((r) => ({
      id: r.id,
      name: r.name,
      dealerCount: r.dealer_count,
    })),
    unassignedDistributor: unassigned?.unassigned_distributor ?? 0,
    unassignedSalesExecutive: unassigned?.unassigned_sales_executive ?? 0,
  };
}

export async function getAssignmentOptions(db: D1Database) {
  const { results: distributors } = await db
    .prepare(`SELECT id, name, region FROM distributors WHERE deleted_at IS NULL ORDER BY name`)
    .all<{ id: string; name: string; region: string }>();

  const { results: salesExecutives } = await db
    .prepare(
      `SELECT u.id, u.name, u.phone,
              COALESCE(
                u.distributor_id,
                (SELECT d.distributor_id FROM dealers d
                 WHERE d.sales_executive_user_id = u.id AND d.deleted_at IS NULL
                 LIMIT 1)
              ) as distributor_id
       FROM users u
       WHERE u.role = 'sales_executive' AND u.deleted_at IS NULL AND u.status = 'active'
       ORDER BY u.name`,
    )
    .all<{ id: string; name: string; phone: string; distributor_id: string | null }>();

  return {
    distributors,
    salesExecutives: salesExecutives.map((u) => ({
      id: u.id,
      name: u.name,
      phone: u.phone,
      distributorId: u.distributor_id,
    })),
  };
}

/** SE picklists for signup approval — includes SEs linked via dealers / assignments under a distributor. */
export async function getSignupApprovalOptions(db: D1Database, distributorId?: string) {
  const { results: distributors } = await db
    .prepare(`SELECT id, name, region FROM distributors WHERE deleted_at IS NULL ORDER BY name`)
    .all<{ id: string; name: string; region: string }>();

  let seSql = `
    SELECT DISTINCT u.id, u.name, u.phone,
      COALESCE(
        u.distributor_id,
        (SELECT d.distributor_id FROM dealers d
         WHERE d.sales_executive_user_id = u.id AND d.deleted_at IS NULL
         LIMIT 1)
      ) as distributor_id
    FROM users u
    WHERE u.role = 'sales_executive' AND u.deleted_at IS NULL AND u.status = 'active'`;
  const seBinds: unknown[] = [];

  if (distributorId) {
    seSql += `
      AND (
        u.distributor_id = ?
        OR EXISTS (
          SELECT 1 FROM dealers d
          WHERE d.sales_executive_user_id = u.id AND d.distributor_id = ? AND d.deleted_at IS NULL
        )
        OR EXISTS (
          SELECT 1 FROM dealer_assignments da
          JOIN dealers d ON d.id = da.dealer_id AND d.deleted_at IS NULL
          WHERE da.assignee_user_id = u.id AND da.assignee_role = 'sales_executive' AND d.distributor_id = ?
        )
      )`;
    seBinds.push(distributorId, distributorId, distributorId);
  }

  seSql += ` ORDER BY u.name`;

  const { results: salesExecutives } = await db
    .prepare(seSql)
    .bind(...seBinds)
    .all<{ id: string; name: string; phone: string; distributor_id: string | null }>();

  return {
    distributors,
    salesExecutives: salesExecutives.map((u) => ({
      id: u.id,
      name: u.name,
      phone: u.phone,
      distributorId: u.distributor_id,
    })),
  };
}

async function validateDistributorId(db: D1Database, distributorId: string | null | undefined) {
  if (distributorId === undefined) return;
  if (distributorId === null) return;
  const row = await db
    .prepare(`SELECT id FROM distributors WHERE id = ? AND deleted_at IS NULL`)
    .bind(distributorId)
    .first();
  if (!row) throw new Error("Distributor not found");
}

async function validateSalesExecutiveUserId(db: D1Database, userId: string | null | undefined) {
  if (userId === undefined) return;
  if (userId === null) return;
  const row = await db
    .prepare(
      `SELECT id FROM users WHERE id = ? AND role = 'sales_executive' AND status = 'active' AND deleted_at IS NULL`,
    )
    .bind(userId)
    .first();
  if (!row) throw new Error("Sales executive not found or inactive");
}

export async function updateDealerAssignment(
  db: D1Database,
  dealerId: string,
  patch: AssignmentPatch,
  actorUserId: string,
) {
  const before = await getDealerSnapshot(db, dealerId);
  if (!before) throw new Error("Dealer not found");

  await validateDistributorId(db, patch.distributorId);
  await validateSalesExecutiveUserId(db, patch.salesExecutiveUserId);

  const sets: string[] = ["updated_at = ?"];
  const binds: unknown[] = [nowIso()];

  if (patch.distributorId !== undefined) {
    sets.push("distributor_id = ?");
    binds.push(patch.distributorId);
  }
  if (patch.salesExecutiveUserId !== undefined) {
    sets.push("sales_executive_user_id = ?");
    binds.push(patch.salesExecutiveUserId);
  }

  if (sets.length === 1) throw new Error("No assignment fields to update");

  binds.push(dealerId);
  await db.prepare(`UPDATE dealers SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();

  const afterRow = await db
    .prepare(
      `SELECT d.*, dist.name as distributor_name, se.name as sales_executive_name
       FROM dealers d
       LEFT JOIN distributors dist ON dist.id = d.distributor_id
       LEFT JOIN users se ON se.id = d.sales_executive_user_id
       WHERE d.id = ? AND d.deleted_at IS NULL`,
    )
    .bind(dealerId)
    .first<Record<string, unknown>>();

  const after = afterRow
    ? {
        distributor_id: afterRow.distributor_id as string | null,
        sales_executive_user_id: afterRow.sales_executive_user_id as string | null,
        distributor_name: afterRow.distributor_name as string | null,
        sales_executive_name: afterRow.sales_executive_name as string | null,
        store_name: afterRow.store_name as string,
        code: afterRow.code as string,
      }
    : null;
  const auditActions: string[] = [];
  if (patch.distributorId !== undefined) {
    auditActions.push(
      patch.distributorId === null ? "assignment.distributor.clear" : "assignment.distributor.set",
    );
  }
  if (patch.salesExecutiveUserId !== undefined) {
    auditActions.push(
      patch.salesExecutiveUserId === null
        ? "assignment.sales_executive.clear"
        : "assignment.sales_executive.set",
    );
  }

  for (const action of auditActions) {
    await writeAuditLog(db, {
      actorUserId,
      action,
      entityType: "dealer_assignment",
      entityId: dealerId,
      before: {
        distributorId: before.distributor_id,
        distributorName: before.distributor_name,
        salesExecutiveUserId: before.sales_executive_user_id,
        salesExecutiveName: before.sales_executive_name,
        dealerName: before.store_name,
        dealerCode: before.code,
      },
      after: after
        ? {
            distributorId: after.distributor_id,
            distributorName: after.distributor_name,
            salesExecutiveUserId: after.sales_executive_user_id,
            salesExecutiveName: after.sales_executive_name,
            dealerName: after.store_name,
            dealerCode: after.code,
          }
        : null,
    });
  }

  if (after) {
    if (
      patch.salesExecutiveUserId &&
      patch.salesExecutiveUserId !== before.sales_executive_user_id
    ) {
      await notifySalesExecutive(db, patch.salesExecutiveUserId, {
        category: "system",
        type: "system",
        title: "Dealer assigned to you",
        body: `${after.store_name} (${after.code}) is now under your portfolio`,
        link: `/distributor/dealers/${dealerId}`,
        ...withNotificationI18n("notifications.dealerAssignedToYou.title", "notifications.dealerAssignedToYou.body", {
          storeName: after.store_name,
          code: after.code,
        }),
      });
    }
    if (patch.distributorId !== undefined && patch.distributorId !== before.distributor_id) {
      if (patch.distributorId) {
        await notifyDistributorsForOrg(db, patch.distributorId, {
          category: "system",
          type: "system",
          title: "Dealer assigned",
          body: `${after.store_name} (${after.code}) joined your network`,
          link: `/distributor/dealers/${dealerId}`,
          ...withNotificationI18n("notifications.dealerJoinedNetwork.title", "notifications.dealerJoinedNetwork.body", {
            storeName: after.store_name,
            code: after.code,
          }),
        });
      }
      await notifyDealerUsers(db, dealerId, {
        category: "system",
        type: "system",
        title: "Distributor updated",
        body: after.distributor_name
          ? `Your account is now linked to ${after.distributor_name}`
          : "Your distributor assignment has been updated",
        link: "/profile",
        ...withNotificationI18n(
          "notifications.distributorUpdated.title",
          after.distributor_name
            ? "notifications.distributorUpdated.bodyWithName"
            : "notifications.distributorUpdated.body",
          after.distributor_name ? { distributorName: after.distributor_name } : undefined,
        ),
      });
    }
  }

  return afterRow ? mapRow(afterRow) : null;
}

export async function bulkUpdateAssignments(
  db: D1Database,
  dealerIds: string[],
  patch: AssignmentPatch,
  actorUserId: string,
) {
  if (!dealerIds.length) throw new Error("No dealers selected");
  const MAX_BULK = 50;
  if (dealerIds.length > MAX_BULK) {
    throw new Error(`Maximum ${MAX_BULK} dealers per bulk update`);
  }
  if (!patch.distributorId && !patch.salesExecutiveUserId) {
    throw new Error("No assignment fields to update");
  }

  const ts = nowIso();
  const placeholders = dealerIds.map(() => "?").join(",");

  // Validate the referenced distributor / sales-executive up front (reads, not part of the write
  // transaction). Then apply BOTH column updates in a single db.batch so a mid-way failure can't
  // leave only the distributor (or only the SE) applied to the selected dealers.
  if (patch.distributorId) {
    const dist = await db
      .prepare(`SELECT id FROM distributors WHERE id = ? AND deleted_at IS NULL`)
      .bind(patch.distributorId)
      .first();
    if (!dist) throw new Error("Distributor not found");
  }
  if (patch.salesExecutiveUserId) {
    const se = await db
      .prepare(
        `SELECT id FROM users WHERE id = ? AND role = 'sales_executive' AND deleted_at IS NULL`,
      )
      .bind(patch.salesExecutiveUserId)
      .first();
    if (!se) throw new Error("Sales executive not found");
  }

  const writes: D1PreparedStatement[] = [];
  if (patch.distributorId !== undefined) {
    writes.push(
      db
        .prepare(
          `UPDATE dealers SET distributor_id = ?, updated_at = ?
           WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
        )
        .bind(patch.distributorId, ts, ...dealerIds),
    );
  }
  if (patch.salesExecutiveUserId !== undefined) {
    writes.push(
      db
        .prepare(
          `UPDATE dealers SET sales_executive_user_id = ?, updated_at = ?
           WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
        )
        .bind(patch.salesExecutiveUserId, ts, ...dealerIds),
    );
  }
  if (writes.length) await db.batch(writes);

  const { results } = await db
    .prepare(
      `SELECT d.id, d.store_name as name, d.code, d.location, d.distributor_id, d.sales_executive_user_id,
              dist.name as distributor_name, se.name as sales_executive_name
       FROM dealers d
       LEFT JOIN distributors dist ON dist.id = d.distributor_id
       LEFT JOIN users se ON se.id = d.sales_executive_user_id
       WHERE d.id IN (${placeholders}) AND d.deleted_at IS NULL`,
    )
    .bind(...dealerIds)
    .all<Record<string, unknown>>();

  const rows = results.map((r) => mapRow(r));

  await writeAuditLog(db, {
    actorUserId,
    action: "assignment.bulk",
    entityType: "dealer_assignment",
    after: { dealerIds, patch, count: rows.length },
  });
  return rows;
}
