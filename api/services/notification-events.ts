import { createNotification, createNotificationsBatch } from "./notifications";

export type NotifyInput = {
  category: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  isReminder?: boolean;
  metadata?: Record<string, unknown>;
};

async function notifyUserIds(db: D1Database, userIds: string[], input: NotifyInput) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return;
  await createNotificationsBatch(
    db,
    unique.map((recipientUserId) => ({ recipientUserId, ...input })),
  );
}

export async function notifyUser(db: D1Database, userId: string, input: NotifyInput) {
  await notifyUserIds(db, [userId], input);
}

export async function notifyMasterAdmins(db: D1Database, input: NotifyInput) {
  const { results } = await db
    .prepare(`SELECT id FROM users WHERE role = 'master_admin' AND status = 'active' AND deleted_at IS NULL`)
    .all<{ id: string }>();
  await notifyUserIds(
    db,
    results.map((u) => u.id),
    input,
  );
}

export async function notifyAdminStaff(db: D1Database, input: NotifyInput) {
  const { results } = await db
    .prepare(`SELECT id FROM users WHERE role = 'admin_staff' AND status = 'active' AND deleted_at IS NULL`)
    .all<{ id: string }>();
  await notifyUserIds(
    db,
    results.map((u) => u.id),
    input,
  );
}

export async function notifySignupReviewers(db: D1Database, input: NotifyInput) {
  const { results } = await db
    .prepare(
      `SELECT id FROM users WHERE role IN ('master_admin', 'admin_staff') AND status = 'active' AND deleted_at IS NULL`,
    )
    .all<{ id: string }>();
  await notifyUserIds(
    db,
    results.map((u) => u.id),
    input,
  );
}

export async function notifyDistributorsForOrg(db: D1Database, distributorId: string, input: NotifyInput) {
  const { results } = await db
    .prepare(
      `SELECT id FROM users WHERE distributor_id = ? AND role = 'distributor' AND status = 'active' AND deleted_at IS NULL`,
    )
    .bind(distributorId)
    .all<{ id: string }>();
  await notifyUserIds(
    db,
    results.map((u) => u.id),
    input,
  );
}

export async function notifySalesExecutive(db: D1Database, userId: string, input: NotifyInput) {
  await notifyUser(db, userId, input);
}

export async function notifyDealerUsers(db: D1Database, dealerId: string, input: NotifyInput) {
  const { results } = await db
    .prepare(
      `SELECT id FROM users WHERE dealer_id = ? AND role = 'dealer' AND status = 'active' AND deleted_at IS NULL`,
    )
    .bind(dealerId)
    .all<{ id: string }>();
  await notifyUserIds(
    db,
    results.map((u) => u.id),
    input,
  );
}

export async function notifyAllDealerUsers(db: D1Database, input: NotifyInput) {
  const { results } = await db
    .prepare(`SELECT id FROM users WHERE role = 'dealer' AND status = 'active' AND deleted_at IS NULL`)
    .all<{ id: string }>();
  await notifyUserIds(
    db,
    results.map((u) => u.id),
    input,
  );
}

export async function notifyAllDistributorUsers(db: D1Database, input: NotifyInput) {
  const { results } = await db
    .prepare(`SELECT id FROM users WHERE role = 'distributor' AND status = 'active' AND deleted_at IS NULL`)
    .all<{ id: string }>();
  await notifyUserIds(
    db,
    results.map((u) => u.id),
    input,
  );
}

export async function notifyDealerUsersForDistributor(
  db: D1Database,
  distributorId: string,
  input: NotifyInput,
) {
  const { results } = await db
    .prepare(
      `SELECT u.id FROM users u
       JOIN dealers d ON d.id = u.dealer_id
       WHERE d.distributor_id = ? AND u.role = 'dealer' AND u.status = 'active' AND u.deleted_at IS NULL`,
    )
    .bind(distributorId)
    .all<{ id: string }>();
  await notifyUserIds(
    db,
    results.map((u) => u.id),
    input,
  );
}

export async function getOrderNotificationContext(db: D1Database, orderId: string) {
  return db
    .prepare(
      `SELECT o.id, o.dealer_id, o.distributor_id, d.store_name as dealer_name
       FROM orders o JOIN dealers d ON d.id = o.dealer_id
       WHERE o.id = ? AND o.deleted_at IS NULL`,
    )
    .bind(orderId)
    .first<{ id: string; dealer_id: string; distributor_id: string; dealer_name: string }>();
}

export async function notifyOrderStatusChange(
  db: D1Database,
  orderId: string,
  toStatus: string,
  extra?: { reason?: string; points?: number },
) {
  const ctx = await getOrderNotificationContext(db, orderId);
  if (!ctx) return;

  const dealerLink = `/orders/${orderId}`;
  const distLink = `/distributor/orders/${orderId}`;
  const adminLink = `/admin/orders/${orderId}`;
  const store = ctx.dealer_name;

  if (toStatus === "approved") {
    await notifyDealerUsers(db, ctx.dealer_id, {
      category: "orders",
      type: "order_approved",
      title: "Order approved",
      body: `Your order ${orderId} has been approved`,
      link: dealerLink,
    });
    return;
  }

  if (toStatus === "rejected") {
    await notifyDealerUsers(db, ctx.dealer_id, {
      category: "orders",
      type: "order_rejected",
      title: "Order rejected",
      body: extra?.reason
        ? `Order ${orderId} was rejected: ${extra.reason}`
        : `Order ${orderId} was rejected`,
      link: dealerLink,
    });
    return;
  }

  if (toStatus === "in_making") {
    await notifyDealerUsers(db, ctx.dealer_id, {
      category: "orders",
      type: "order_in_making",
      title: "Order in production",
      body: `Order ${orderId} is now being manufactured`,
      link: dealerLink,
    });
    return;
  }

  if (toStatus === "out_for_delivery") {
    await notifyDealerUsers(db, ctx.dealer_id, {
      category: "orders",
      type: "order_out_for_delivery",
      title: "Order out for delivery",
      body: `Order ${orderId} is on the way to ${store}`,
      link: dealerLink,
    });
    return;
  }

  if (toStatus === "delivered") {
    const pointsMsg =
      extra?.points && extra.points > 0
        ? ` You earned ${extra.points} reward points.`
        : "";
    await notifyDealerUsers(db, ctx.dealer_id, {
      category: "orders",
      type: "order_delivered",
      body: `Order ${orderId} has been delivered.${pointsMsg}`,
      link: dealerLink,
    });
    await notifyDistributorsForOrg(db, ctx.distributor_id, {
      category: "orders",
      type: "order_delivered",
      body: `Order ${orderId} for ${store} has been delivered`,
      link: distLink,
    });
    await notifyMasterAdmins(db, {
      category: "orders",
      type: "order_delivered",
      body: `Order ${orderId} has been marked delivered`,
      link: adminLink,
    });
    return;
  }

  if (toStatus === "cancelled") {
    await notifyDealerUsers(db, ctx.dealer_id, {
      category: "orders",
      type: "order_rejected",
      title: "Order cancelled",
      body: extra?.reason
        ? `Order ${orderId} was cancelled: ${extra.reason}`
        : `Order ${orderId} was cancelled`,
      link: dealerLink,
    });
    await notifyDistributorsForOrg(db, ctx.distributor_id, {
      category: "orders",
      type: "order_rejected",
      title: "Order cancelled",
      body: `Order ${orderId} for ${store} was cancelled`,
      link: distLink,
    });
  }
}

export async function notifyNewOrder(
  db: D1Database,
  orderId: string,
  dealerName: string,
  distributorId: string,
) {
  await notifyDistributorsForOrg(db, distributorId, {
    category: "orders",
    type: "new_order",
    title: "New order placed",
    body: `${dealerName} placed order ${orderId}`,
    link: `/distributor/orders/${orderId}`,
  });
  await notifyMasterAdmins(db, {
    category: "orders",
    type: "new_order",
    title: "New order placed",
    body: `${dealerName} placed order ${orderId}`,
    link: `/admin/orders/${orderId}`,
  });
  await notifyAdminStaff(db, {
    category: "orders",
    type: "new_order",
    title: "New order placed",
    body: `${dealerName} placed order ${orderId}`,
    link: `/admin/orders/${orderId}`,
  });
}

export async function notifyCampaignPublished(
  db: D1Database,
  input: {
    campaignId: string;
    name: string;
    productName: string;
    discountPercent?: number;
    targetDealers: boolean;
    targetDistributors: boolean;
    distributorId?: string | null;
  },
) {
  const body = input.discountPercent
    ? `${input.name}: extra ${input.discountPercent}% off ${input.productName}`
    : `${input.name} is now live for ${input.productName}`;

  const dealerPayload: NotifyInput = {
    category: "campaigns",
    type: "campaign_new",
    title: "New campaign",
    body,
    link: `/campaigns/${input.campaignId}`,
  };

  const distPayload: NotifyInput = {
    category: "campaigns",
    type: "campaign_new",
    title: "New campaign",
    body,
    link: `/distributor/campaigns/${input.campaignId}`,
  };

  if (input.targetDealers) {
    if (input.distributorId) {
      await notifyDealerUsersForDistributor(db, input.distributorId, dealerPayload);
    } else {
      await notifyAllDealerUsers(db, dealerPayload);
    }
  }

  if (input.targetDistributors) {
    if (input.distributorId) {
      await notifyDistributorsForOrg(db, input.distributorId, distPayload);
    } else {
      await notifyAllDistributorUsers(db, distPayload);
    }
  }
}
