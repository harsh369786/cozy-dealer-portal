import { permissionsForSharedRole, type SharedPermission } from "../../shared/rbac-permissions";
import { createNotificationsBatch } from "./notifications";

export type NotifyInput = {
  category: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  isReminder?: boolean;
  metadata?: Record<string, unknown>;
};

export function withNotificationI18n(
  titleKey: string,
  bodyKey: string,
  params?: Record<string, string | number>,
  extra?: Record<string, unknown>,
): Pick<NotifyInput, "metadata"> {
  return {
    metadata: {
      ...extra,
      i18n: { titleKey, bodyKey, params: params ?? {} },
    },
  };
}

async function notifyUserIds(
  db: D1Database,
  userIds: string[],
  input: NotifyInput,
  excludeUserId?: string,
) {
  const unique = [...new Set(userIds.filter(Boolean))].filter((uid) => uid !== excludeUserId);
  if (!unique.length) return;
  await createNotificationsBatch(
    db,
    unique.map((recipientUserId) => ({ recipientUserId, ...input })),
  );
}

export async function notifyUser(
  db: D1Database,
  userId: string,
  input: NotifyInput,
  excludeUserId?: string,
) {
  await notifyUserIds(db, [userId], input, excludeUserId);
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

/** Master admin always; admin_staff only when their role includes the permission. */
export async function notifyOperationalAdmins(
  db: D1Database,
  permission: SharedPermission,
  input: NotifyInput,
  excludeUserId?: string,
) {
  const staffHasPermission = permissionsForSharedRole("admin_staff").includes(permission);
  const { results } = await db
    .prepare(
      `SELECT id, role FROM users
       WHERE status = 'active' AND deleted_at IS NULL
         AND (role = 'master_admin'${staffHasPermission ? " OR role = 'admin_staff'" : ""})`,
    )
    .all<{ id: string; role: string }>();
  await notifyUserIds(
    db,
    results.map((u) => u.id),
    input,
    excludeUserId,
  );
}

export async function notifySignupReviewers(db: D1Database, input: NotifyInput) {
  await notifyOperationalAdmins(db, "signup:review", input);
}

export async function notifyDistributorsForOrg(
  db: D1Database,
  distributorId: string,
  input: NotifyInput,
  excludeUserId?: string,
) {
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
    excludeUserId,
  );
}

export async function notifySalesExecutive(db: D1Database, userId: string, input: NotifyInput) {
  await notifyUser(db, userId, input);
}

export async function notifyDealerUsers(
  db: D1Database,
  dealerId: string,
  input: NotifyInput,
  excludeUserId?: string,
) {
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
    excludeUserId,
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

type OrderStatusPayload = {
  dealer: NotifyInput;
  distributor?: NotifyInput;
  admin?: NotifyInput;
};

async function dispatchOrderStatusNotifications(
  db: D1Database,
  ctx: { dealer_id: string; distributor_id: string },
  payloads: OrderStatusPayload,
  excludeUserId?: string,
) {
  // Resilient fan-out: each recipient group runs independently so a failure notifying one group
  // (e.g. a transient D1 error, or a distributor with no users) can NEVER prevent the others from
  // being notified. Previously these ran in a single await chain, so any throw silently dropped the
  // remaining groups. The dealer is the primary recipient of a status change and must always be
  // attempted first. Errors are logged with context instead of bubbling up and aborting the request.
  const groups: Array<{ name: string; run: () => Promise<void> }> = [
    { name: "dealer", run: () => notifyDealerUsers(db, ctx.dealer_id, payloads.dealer, excludeUserId) },
  ];
  if (payloads.distributor) {
    groups.push({
      name: "distributor",
      run: () => notifyDistributorsForOrg(db, ctx.distributor_id, payloads.distributor!, excludeUserId),
    });
  }
  if (payloads.admin) {
    groups.push({
      name: "admin",
      run: () => notifyOperationalAdmins(db, "orders:read", payloads.admin!, excludeUserId),
    });
  }

  for (const group of groups) {
    try {
      await group.run();
    } catch (err) {
      console.error(
        `[notify] order-status ${group.name} fan-out failed (dealer_id=${ctx.dealer_id}, distributor_id=${ctx.distributor_id}):`,
        err,
      );
    }
  }
}

export async function notifyOrderStatusChange(
  db: D1Database,
  orderId: string,
  toStatus: string,
  extra?: { reason?: string; points?: number; actorUserId?: string },
) {
  const ctx = await getOrderNotificationContext(db, orderId);
  if (!ctx) return;
  const actorUserId = extra?.actorUserId;

  const dealerLink = `/orders/${orderId}`;
  const distLink = `/distributor/orders/${orderId}`;
  const adminLink = `/admin/orders/${orderId}`;
  const store = ctx.dealer_name;

  if (toStatus === "approved") {
    await dispatchOrderStatusNotifications(db, ctx, {
      dealer: {
        category: "orders",
        type: "order_approved",
        title: "Order approved",
        body: `Your order ${orderId} has been approved`,
        link: dealerLink,
        ...withNotificationI18n("notifications.orderApproved.title", "notifications.orderApproved.body", {
          orderId,
        }),
      },
      distributor: {
        category: "orders",
        type: "order_approved",
        title: "Order approved",
        body: `Order ${orderId} for ${store} has been approved`,
        link: distLink,
        ...withNotificationI18n(
          "notifications.orderApproved.title",
          "notifications.orderApproved.bodyDistributor",
          { orderId, storeName: store },
        ),
      },
    }, actorUserId);
    return;
  }

  if (toStatus === "rejected") {
    const reasonSuffix = extra?.reason ? `: ${extra.reason}` : "";
    const reasonParams = extra?.reason ? { reason: extra.reason } : {};
    await dispatchOrderStatusNotifications(db, ctx, {
      dealer: {
        category: "orders",
        type: "order_rejected",
        title: "Order rejected",
        body: `Order ${orderId} was rejected${reasonSuffix}`,
        link: dealerLink,
        ...withNotificationI18n(
          "notifications.orderRejected.title",
          extra?.reason ? "notifications.orderRejected.bodyWithReason" : "notifications.orderRejected.body",
          { orderId, ...reasonParams },
        ),
      },
      distributor: {
        category: "orders",
        type: "order_rejected",
        title: "Order rejected",
        body: `Order ${orderId} for ${store} was rejected${reasonSuffix}`,
        link: distLink,
        ...withNotificationI18n(
          "notifications.orderRejected.title",
          extra?.reason
            ? "notifications.orderRejected.bodyDistributorWithReason"
            : "notifications.orderRejected.bodyDistributor",
          { orderId, storeName: store, ...reasonParams },
        ),
      },
      admin: {
        category: "orders",
        type: "order_rejected",
        title: "Order rejected",
        body: `Order ${orderId} for ${store} was rejected${reasonSuffix}`,
        link: adminLink,
        ...withNotificationI18n(
          "notifications.orderRejected.title",
          extra?.reason ? "notifications.orderRejected.bodyAdminWithReason" : "notifications.orderRejected.bodyAdmin",
          { orderId, storeName: store, ...reasonParams },
        ),
      },
    }, actorUserId);
    return;
  }

  if (toStatus === "in_making") {
    await dispatchOrderStatusNotifications(db, ctx, {
      dealer: {
        category: "orders",
        type: "order_in_making",
        title: "Order in production",
        body: `Order ${orderId} is now being manufactured`,
        link: dealerLink,
        ...withNotificationI18n("notifications.orderInMaking.title", "notifications.orderInMaking.body", { orderId }),
      },
      distributor: {
        category: "orders",
        type: "order_in_making",
        title: "Order in production",
        body: `Order ${orderId} for ${store} is now in production`,
        link: distLink,
        ...withNotificationI18n(
          "notifications.orderInMaking.title",
          "notifications.orderInMaking.bodyDistributor",
          { orderId, storeName: store },
        ),
      },
    }, actorUserId);
    return;
  }

  if (toStatus === "out_for_delivery") {
    await dispatchOrderStatusNotifications(db, ctx, {
      dealer: {
        category: "orders",
        type: "order_out_for_delivery",
        title: "Order Dispatched from Factory",
        body: `📦 Your order ${orderId} has been dispatched from the factory and is now on its way.`,
        link: dealerLink,
        ...withNotificationI18n(
          "notifications.orderOutForDelivery.title",
          "notifications.orderOutForDelivery.body",
          { orderId, storeName: store },
        ),
      },
      distributor: {
        category: "orders",
        type: "order_out_for_delivery",
        title: "Order Dispatched from Factory",
        body: `📦 Order ${orderId} for ${store} has been dispatched from the factory and is now on its way.`,
        link: distLink,
        ...withNotificationI18n(
          "notifications.orderOutForDelivery.title",
          "notifications.orderOutForDelivery.bodyDistributor",
          { orderId, storeName: store },
        ),
      },
    }, actorUserId);
    return;
  }

  if (toStatus === "delivered") {
    const pointsMsg =
      extra?.points && extra.points > 0
        ? ` You earned ${extra.points} reward points.`
        : "";
    const hasPoints = Boolean(extra?.points && extra.points > 0);
    await dispatchOrderStatusNotifications(db, ctx, {
      dealer: {
        category: "orders",
        type: "order_delivered",
        title: "Order delivered",
        body: `Order ${orderId} has been delivered.${pointsMsg}`,
        link: dealerLink,
        ...withNotificationI18n(
          "notifications.orderDelivered.title",
          hasPoints ? "notifications.orderDelivered.bodyWithPoints" : "notifications.orderDelivered.body",
          hasPoints ? { orderId, points: extra!.points! } : { orderId },
        ),
      },
      distributor: {
        category: "orders",
        type: "order_delivered",
        title: "Order delivered",
        body: `Order ${orderId} for ${store} has been delivered`,
        link: distLink,
        ...withNotificationI18n(
          "notifications.orderDelivered.title",
          "notifications.orderDelivered.bodyDistributor",
          { orderId, storeName: store },
        ),
      },
      admin: {
        category: "orders",
        type: "order_delivered",
        title: "Order delivered",
        body: `Order ${orderId} for ${store} has been marked delivered`,
        link: adminLink,
        ...withNotificationI18n(
          "notifications.orderDelivered.title",
          "notifications.orderDelivered.bodyAdmin",
          { orderId, storeName: store },
        ),
      },
    }, actorUserId);
    return;
  }

  if (toStatus === "cancelled") {
    const reasonSuffix = extra?.reason ? `: ${extra.reason}` : "";
    const reasonParams = extra?.reason ? { reason: extra.reason } : {};
    await dispatchOrderStatusNotifications(db, ctx, {
      dealer: {
        category: "orders",
        type: "order_cancelled",
        title: "Order cancelled",
        body: `Order ${orderId} was cancelled${reasonSuffix}`,
        link: dealerLink,
        ...withNotificationI18n(
          "notifications.orderCancelled.title",
          extra?.reason ? "notifications.orderCancelled.bodyWithReason" : "notifications.orderCancelled.body",
          { orderId, ...reasonParams },
        ),
      },
      distributor: {
        category: "orders",
        type: "order_cancelled",
        title: "Order cancelled",
        body: `Order ${orderId} for ${store} was cancelled${reasonSuffix}`,
        link: distLink,
        ...withNotificationI18n(
          "notifications.orderCancelled.title",
          extra?.reason
            ? "notifications.orderCancelled.bodyDistributorWithReason"
            : "notifications.orderCancelled.bodyDistributor",
          { orderId, storeName: store, ...reasonParams },
        ),
      },
      admin: {
        category: "orders",
        type: "order_cancelled",
        title: "Order cancelled",
        body: `Order ${orderId} for ${store} was cancelled${reasonSuffix}`,
        link: adminLink,
        ...withNotificationI18n(
          "notifications.orderCancelled.title",
          extra?.reason ? "notifications.orderCancelled.bodyAdminWithReason" : "notifications.orderCancelled.bodyAdmin",
          { orderId, storeName: store, ...reasonParams },
        ),
      },
    }, actorUserId);
  }
}

export async function notifyNewOrder(
  db: D1Database,
  orderId: string,
  dealerId: string,
  dealerName: string,
  distributorId: string,
  actorUserId?: string,
) {
  const dealerLink = `/orders/${orderId}`;
  const distLink = `/distributor/orders/${orderId}`;
  const adminLink = `/admin/orders/${orderId}`;

  // Notify OTHER dealer users of the same dealer org, but exclude the acting user
  // so the dealer who just placed the order does not get a redundant self-echo.
  await notifyDealerUsers(
    db,
    dealerId,
    {
      category: "orders",
      type: "order_placed",
      title: "Order placed",
      body: `Your order ${orderId} has been placed successfully`,
      link: dealerLink,
      ...withNotificationI18n("notifications.orderPlaced.title", "notifications.orderPlaced.body", { orderId }),
    },
    actorUserId,
  );
  await notifyDistributorsForOrg(db, distributorId, {
    category: "orders",
    type: "new_order",
    title: "New order pending approval",
    body: `${dealerName} placed order ${orderId}. Action required: approve or reject.`,
    link: distLink,
    ...withNotificationI18n(
      "notifications.newOrderPendingApproval.title",
      "notifications.newOrderPendingApproval.body",
      { dealerName, orderId },
    ),
  });
  const assignedSe = await db
    .prepare(
      `SELECT sales_executive_user_id FROM dealers WHERE id = ? AND sales_executive_user_id IS NOT NULL AND deleted_at IS NULL`,
    )
    .bind(dealerId)
    .first<{ sales_executive_user_id: string }>();
  if (assignedSe?.sales_executive_user_id) {
    await notifySalesExecutive(db, assignedSe.sales_executive_user_id, {
      category: "orders",
      type: "new_order",
      title: "New order placed",
      body: `${dealerName} placed order ${orderId}`,
      link: distLink,
      ...withNotificationI18n("notifications.newOrder.title", "notifications.newOrder.body", {
        dealerName,
        orderId,
      }),
    });
  }
  await notifyOperationalAdmins(db, "orders:read", {
    category: "orders",
    type: "new_order",
    title: "New order placed",
    body: `${dealerName} placed order ${orderId}`,
    link: adminLink,
    ...withNotificationI18n("notifications.newOrder.title", "notifications.newOrder.body", {
      dealerName,
      orderId,
    }),
  });
}

export async function notifyRewardClaim(
  db: D1Database,
  input: {
    claimId: string;
    dealerId: string;
    dealerName: string;
    distributorId: string;
    rewardName: string;
    pointsRequired: number;
  },
) {
  const adminBody = `${input.dealerName} claimed ${input.rewardName} (${input.pointsRequired} points)`;

  await notifyDealerUsers(db, input.dealerId, {
    category: "system",
    type: "reward_claim",
    title: "Reward claim submitted",
    body: `Your claim for ${input.rewardName} has been submitted`,
    link: "/rewards",
    ...withNotificationI18n(
      "notifications.rewardClaimSubmitted.title",
      "notifications.rewardClaimSubmitted.bodyDealer",
      { rewardName: input.rewardName },
    ),
  });
  if (input.distributorId) {
    await notifyDistributorsForOrg(db, input.distributorId, {
    category: "system",
    type: "reward_claim",
    title: "Reward claim submitted",
    body: adminBody,
    link: "/distributor/rewards",
    ...withNotificationI18n(
      "notifications.rewardClaimSubmitted.title",
      "notifications.rewardClaimSubmitted.bodyStaff",
      {
        dealerName: input.dealerName,
        rewardName: input.rewardName,
        pointsRequired: input.pointsRequired,
      },
    ),
    });
  }
  await notifyOperationalAdmins(db, "rewards:read", {
    category: "system",
    type: "reward_claim",
    title: "Reward claim submitted",
    body: adminBody,
    link: "/admin/rewards/claims",
    ...withNotificationI18n(
      "notifications.rewardClaimSubmitted.title",
      "notifications.rewardClaimSubmitted.bodyStaff",
      {
        dealerName: input.dealerName,
        rewardName: input.rewardName,
        pointsRequired: input.pointsRequired,
      },
    ),
  });
}

/**
 * Notify all concerned parties when a reward CLAIM changes workflow status. Mirrors the order
 * status-change pattern: dealer always; distributor when relevant; operational admins for stages
 * they act on. Rejection includes the mandatory reason. Reward claims are independent of orders.
 */
export async function notifyRewardClaimStatusChange(
  db: D1Database,
  input: {
    claimId: string;
    dealerId: string;
    distributorId?: string | null;
    rewardName: string;
    toStatus: string;
    statusLabel: string;
    reason?: string;
    actorUserId?: string;
  },
) {
  const { claimId, dealerId, distributorId, rewardName, toStatus, statusLabel, reason, actorUserId } = input;
  const dealerLink = "/rewards";
  const distLink = `/distributor/reward-claims/${claimId}`;
  const adminLink = `/admin/rewards/claims/${claimId}`;
  const reasonSuffix = reason ? `: ${reason}` : "";

  // Dealer always hears about their claim's progress.
  await notifyDealerUsers(
    db,
    dealerId,
    {
      category: "system",
      type: "reward_claim_status",
      title: `Reward claim ${statusLabel}`,
      body:
        toStatus === "rejected"
          ? `Your claim for ${rewardName} was rejected${reasonSuffix}`
          : `Your claim for ${rewardName} is now ${statusLabel}`,
      link: dealerLink,
      ...withNotificationI18n(
        "notifications.rewardClaimStatus.title",
        toStatus === "rejected"
          ? "notifications.rewardClaimStatus.bodyDealerRejected"
          : "notifications.rewardClaimStatus.bodyDealer",
        { rewardName, status: statusLabel, ...(reason ? { reason } : {}) },
      ),
    },
    actorUserId,
  );

  // Distributor: relevant when they need to approve (pending_approval already notified at creation),
  // when admin dispatches (they then deliver), and on the outcomes they didn't perform.
  if (distributorId) {
    await notifyDistributorsForOrg(
      db,
      distributorId,
      {
        category: "system",
        type: "reward_claim_status",
        title: `Reward claim ${statusLabel}`,
        body: `Claim for ${rewardName} is now ${statusLabel}${reasonSuffix}`,
        link: distLink,
        ...withNotificationI18n(
          "notifications.rewardClaimStatus.title",
          "notifications.rewardClaimStatus.bodyStaff",
          { rewardName, status: statusLabel, ...(reason ? { reason } : {}) },
        ),
      },
      actorUserId,
    );
  }

  // Operational admins / admin staff track the whole pipeline (esp. approved -> process/dispatch).
  await notifyOperationalAdmins(
    db,
    "rewards:read",
    {
      category: "system",
      type: "reward_claim_status",
      title: `Reward claim ${statusLabel}`,
      body: `Claim for ${rewardName} is now ${statusLabel}${reasonSuffix}`,
      link: adminLink,
      ...withNotificationI18n(
        "notifications.rewardClaimStatus.title",
        "notifications.rewardClaimStatus.bodyStaff",
        { rewardName, status: statusLabel, ...(reason ? { reason } : {}) },
      ),
    },
    actorUserId,
  );
}

export async function notifyComplaintCreated(
  db: D1Database,
  input: {
    complaintId: string;
    orderId: string;
    distributorId: string;
    dealerName: string;
  },
) {
  const body = `${input.dealerName} reported an issue on order ${input.orderId}`;
  const adminLink = `/admin/complaints/${input.complaintId}`;
  const distLink = `/distributor/complaints/${input.complaintId}`;

  await notifyDistributorsForOrg(db, input.distributorId, {
    category: "complaints",
    type: "complaint_new",
    title: "New complaint",
    body,
    link: distLink,
    ...withNotificationI18n("notifications.complaintNew.title", "notifications.complaintNew.body", {
      dealerName: input.dealerName,
      orderId: input.orderId,
    }),
  });
  await notifyOperationalAdmins(db, "complaints:read", {
    category: "complaints",
    type: "complaint_new",
    title: "New complaint",
    body,
    link: adminLink,
    ...withNotificationI18n("notifications.complaintNew.title", "notifications.complaintNew.body", {
      dealerName: input.dealerName,
      orderId: input.orderId,
    }),
  });
}

export async function notifyComplaintUpdated(
  db: D1Database,
  input: {
    complaintId: string;
    dealerId: string;
    orderId: string;
    status: string;
  },
) {
  const statusLabel = input.status.replace(/_/g, " ");
  await notifyDealerUsers(db, input.dealerId, {
    category: "complaints",
    type: "complaint_update",
    title: "Complaint updated",
    body: `Your complaint on order ${input.orderId} is now ${statusLabel}`,
    link: `/complaints/${input.complaintId}`,
    ...withNotificationI18n("notifications.complaintUpdated.title", "notifications.complaintUpdated.body", {
      orderId: input.orderId,
      statusLabel,
    }),
  });
}

export async function notifySignupRejected(
  _db: D1Database,
  _userId: string,
  _note?: string | null,
) {
  // Rejected users cannot authenticate (requireActiveAccount blocks them), so an in-app
  // notification would never be readable. Rejection is communicated via the signup review note
  // and audit log; use WhatsApp/email channels if outbound messaging is required.
}

export async function notifyDealerVisitCheckIn(
  db: D1Database,
  input: {
    visitId: string;
    salesExecutiveName: string;
    storeName: string;
    dealerName: string;
  },
) {
  await notifyOperationalAdmins(db, "visits:read", {
    category: "system",
    type: "system",
    title: "Sales executive check-in",
    body: `${input.salesExecutiveName} checked in at ${input.storeName} (${input.dealerName})`,
    link: `/admin/visits/${input.visitId}`,
    ...withNotificationI18n("notifications.visitCheckIn.title", "notifications.visitCheckIn.body", {
      salesExecutiveName: input.salesExecutiveName,
      storeName: input.storeName,
      dealerName: input.dealerName,
    }),
  });
}

async function filterCampaignRecipientsWithoutDuplicate(
  db: D1Database,
  userIds: string[],
  eventKey: string,
): Promise<string[]> {
  if (!userIds.length) return [];
  const placeholders = userIds.map(() => "?").join(", ");
  const { results } = await db
    .prepare(
      `SELECT recipient_user_id FROM notifications
       WHERE recipient_user_id IN (${placeholders})
         AND type = 'campaign_new'
         AND metadata LIKE ?`,
    )
    .bind(...userIds, `%"eventKey":"${eventKey}"%`)
    .all<{ recipient_user_id: string }>();
  const already = new Set(results.map((r) => r.recipient_user_id));
  return userIds.filter((id) => !already.has(id));
}

export async function notifyCampaignPublished(
  db: D1Database,
  input: {
    campaignId: string;
    name: string;
    productName: string;
    productId?: string | null;
    discountPercent?: number;
    distributorId?: string | null;
  },
) {
  const body = input.discountPercent
    ? `${input.name}: extra ${input.discountPercent}% off ${input.productName}`
    : `${input.name} is now live for ${input.productName}`;

  const eventKey = `campaign:${input.campaignId}:published`;
  const bodyKey = input.discountPercent
    ? "notifications.campaignNew.bodyDiscount"
    : "notifications.campaignNew.bodyLive";
  const i18nParams = input.discountPercent
    ? {
        name: input.name,
        percent: input.discountPercent,
        productName: input.productName,
      }
    : { name: input.name, productName: input.productName };
  const metadata = {
    eventKey,
    i18n: {
      titleKey: "notifications.campaignNew.title",
      bodyKey,
      params: i18nParams,
    },
  };

  const dealerLink = input.productId
    ? `/products/${input.productId}?campaignId=${input.campaignId}`
    : `/campaigns/${input.campaignId}`;

  const dealerPayload: NotifyInput = {
    category: "campaigns",
    type: "campaign_new",
    title: "New campaign",
    body,
    link: dealerLink,
    metadata,
  };

  const distPayload: NotifyInput = {
    category: "campaigns",
    type: "campaign_new",
    title: "New campaign",
    body,
    link: `/distributor/campaigns/${input.campaignId}`,
    metadata,
  };

  if (input.distributorId) {
    const dealerUsers = await db
      .prepare(
        `SELECT u.id FROM users u
         JOIN dealers d ON d.id = u.dealer_id
         WHERE d.distributor_id = ? AND u.role = 'dealer' AND u.status = 'active' AND u.deleted_at IS NULL`,
      )
      .bind(input.distributorId)
      .all<{ id: string }>();
    const distUsers = await db
      .prepare(
        `SELECT id FROM users WHERE distributor_id = ? AND role = 'distributor' AND status = 'active' AND deleted_at IS NULL`,
      )
      .bind(input.distributorId)
      .all<{ id: string }>();

    const dealerIds = await filterCampaignRecipientsWithoutDuplicate(
      db,
      dealerUsers.results.map((u) => u.id),
      eventKey,
    );
    const distIds = await filterCampaignRecipientsWithoutDuplicate(
      db,
      distUsers.results.map((u) => u.id),
      eventKey,
    );
    if (dealerIds.length) await notifyUserIds(db, dealerIds, dealerPayload);
    if (distIds.length) await notifyUserIds(db, distIds, distPayload);
    return;
  }

  const allDealers = await db
    .prepare(`SELECT id FROM users WHERE role = 'dealer' AND status = 'active' AND deleted_at IS NULL`)
    .all<{ id: string }>();
  const allDists = await db
    .prepare(`SELECT id FROM users WHERE role = 'distributor' AND status = 'active' AND deleted_at IS NULL`)
    .all<{ id: string }>();

  const dealerIds = await filterCampaignRecipientsWithoutDuplicate(
    db,
    allDealers.results.map((u) => u.id),
    eventKey,
  );
  const distIds = await filterCampaignRecipientsWithoutDuplicate(
    db,
    allDists.results.map((u) => u.id),
    eventKey,
  );
  if (dealerIds.length) await notifyUserIds(db, dealerIds, dealerPayload);
  if (distIds.length) await notifyUserIds(db, distIds, distPayload);
}
