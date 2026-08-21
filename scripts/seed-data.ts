import { allProducts, MATTRESS_LAYERS, pillows, priceCampaigns, campaigns, rewards } from "../src/lib/demo-data.ts";
import {
  DISTRIBUTOR_ID,
  dealers,
  distributors,
  seedOrders,
  seedDealerRewardClaims,
  seedCampaigns,
  seedComplaints,
} from "../src/lib/mock/distributor/data.ts";
import { salespeople } from "../src/lib/demo-data.ts";
import { nowIso } from "../api/utils.ts";

const DEALER_USER_ID = "user-dealer-sharma";
const DISTRIBUTOR_USER_ID = "user-dist-vikram";
const ADMIN_USER_ID = "user-admin";
const ADMIN_STAFF_USER_ID = "user-admin-staff";
const SALES_EXEC_USER_ID = "user-sales-exec";

export async function runSeed(db: D1Database) {
  const dist = distributors[DISTRIBUTOR_ID]!;

  for (const [id, d] of Object.entries(distributors)) {
    await db
      .prepare(`INSERT INTO distributors (id, name, region, phone) VALUES (?, ?, ?, ?)`)
      .bind(id, d.name, d.region, d.phone)
      .run();
  }

  await db
    .prepare(
      `INSERT INTO users (id, phone, name, role, dealer_id, distributor_id) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(DISTRIBUTOR_USER_ID, "+919823044120", dist.name, "distributor", null, DISTRIBUTOR_ID)
    .run();

  await db
    .prepare(`INSERT INTO users (id, phone, name, role) VALUES (?, ?, ?, ?)`)
    .bind(ADMIN_USER_ID, "+919999999999", "BackRest Admin", "master_admin")
    .run();

  await db
    .prepare(`INSERT INTO users (id, phone, name, role) VALUES (?, ?, ?, ?)`)
    .bind(ADMIN_STAFF_USER_ID, "+919888877777", "Priya Operations", "admin_staff")
    .run();

  await db
    .prepare(`INSERT INTO users (id, phone, name, role) VALUES (?, ?, ?, ?)`)
    .bind(SALES_EXEC_USER_ID, "+919777766666", "Amit Sales", "sales_executive")
    .run();

  for (const d of dealers) {
    const distributorId = d.id === "dlr-menon" ? null : d.distributorId;
    const salesExecutiveUserId =
      d.id === "dlr-gupta" ? null : d.id === "dlr-sharma" || d.id === "dlr-patil" ? SALES_EXEC_USER_ID : null;

    await db
      .prepare(
        `INSERT INTO dealers (id, distributor_id, sales_executive_user_id, code, store_name, contact_name, location, address, phone, email, gst_number, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        d.id,
        distributorId,
        salesExecutiveUserId,
        d.code,
        d.name,
        d.contactName ?? null,
        d.location,
        d.address ?? null,
        d.phone,
        d.email,
        d.gstNumber ?? null,
        d.active ? 1 : 0,
      )
      .run();
  }

  await db
    .prepare(
      `INSERT INTO users (id, phone, name, role, dealer_id, distributor_id) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(DEALER_USER_ID, "+919876543210", "Rajesh Sharma", "dealer", "dlr-sharma", null)
    .run();

  for (const d of dealers) {
    await db
      .prepare(
        `INSERT INTO dealer_assignments (id, dealer_id, assignee_user_id, assignee_role) VALUES (?, ?, ?, ?)`,
      )
      .bind(`asgn-${d.id}-dist`, d.id, DISTRIBUTOR_USER_ID, "distributor")
      .run();
  }

  const salesExecDealers = dealers.slice(0, Math.min(2, dealers.length));
  for (const d of salesExecDealers) {
    await db
      .prepare(
        `INSERT INTO dealer_assignments (id, dealer_id, assignee_user_id, assignee_role) VALUES (?, ?, ?, ?)`,
      )
      .bind(`asgn-${d.id}-se`, d.id, SALES_EXEC_USER_ID, "sales_executive")
      .run();
  }

  let sort = 0;
  for (const p of allProducts) {
    sort += 1;
    await db
      .prepare(
        `INSERT INTO products (id, name, category, guarantee, fixed_size, blurb, image_url, sort_order, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      .bind(
        p.id,
        p.name,
        p.category,
        p.guarantee,
        p.fixedSize ?? null,
        p.blurb,
        p.image,
        sort,
      )
      .run();

    for (const t of p.thicknesses) {
      await db
        .prepare(`INSERT INTO product_thicknesses (product_id, thickness) VALUES (?, ?)`)
        .bind(p.id, t)
        .run();
    }

    const rewardPercent = p.mrp > 0 ? Math.round((p.points / p.mrp) * 1000) / 10 : 0;
    await db
      .prepare(
        `INSERT INTO product_prices (product_id, mrp, dealer_price, points, reward_percent, reward_eligibility, free_items_label) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(p.id, p.mrp, p.price, p.points, rewardPercent, "dealer", p.free ?? null)
      .run();
  }

  for (const layer of MATTRESS_LAYERS) {
    await db
      .prepare(`INSERT INTO product_layers (id, title, sort_order) VALUES (?, ?, ?)`)
      .bind(layer.id, layer.title, Number(layer.id.replace("layer-", "")))
      .run();

    if ("subgroups" in layer) {
      let i = 0;
      for (const sg of layer.subgroups) {
        for (const pid of sg.productIds) {
          await db
            .prepare(
              `INSERT INTO product_layer_items (layer_id, product_id, subgroup_label, sort_order) VALUES (?, ?, ?, ?)`,
            )
            .bind(layer.id, pid, sg.label, i++)
            .run();
        }
      }
    } else if ("productIds" in layer) {
      let i = 0;
      for (const pid of layer.productIds) {
        await db
          .prepare(`INSERT INTO product_layer_items (layer_id, product_id, sort_order) VALUES (?, ?, ?)`)
          .bind(layer.id, pid, i++)
          .run();
      }
    }
  }

  for (const sp of salespeople) {
    await db
      .prepare(`INSERT INTO salespeople (id, dealer_id, name) VALUES (?, ?, ?)`)
      .bind(`sp-${sp.toLowerCase()}`, "dlr-sharma", sp)
      .run();
  }

  for (const c of priceCampaigns) {
    await db
      .prepare(
        `INSERT INTO price_campaigns (id, name, product_id, discount_percent, start_at, end_at, description, terms, badge_label, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      )
      .bind(
        c.id,
        c.name,
        c.productId,
        c.discountPercent,
        c.startAt,
        c.endAt,
        c.description,
        c.terms ?? null,
        c.badgeLabel ?? null,
      )
      .run();
  }

  for (const c of campaigns) {
    await db
      .prepare(
        `INSERT INTO price_campaigns (id, name, product_id, discount_percent, start_at, end_at, description, badge_label, status, target_count, done_count)
         VALUES (?, ?, NULL, 0, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        c.id,
        c.title,
        new Date(c.starts).toISOString(),
        new Date(c.ends).toISOString(),
        `${c.goal}\n\nReward: ${c.reward}`,
        c.reward,
        c.status,
        c.target,
        c.done,
      )
      .run();
  }

  for (const c of seedCampaigns) {
    await db
      .prepare(
        `INSERT INTO price_campaigns (id, name, product_id, discount_percent, start_at, end_at, description, badge_label, status, distributor_id)
         VALUES (?, ?, NULL, 0, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        c.id,
        c.name,
        c.startDate,
        c.endDate,
        c.description,
        c.discountLabel,
        c.status,
        c.distributorId,
      )
      .run();
  }

  for (const r of rewards) {
    await db
      .prepare(`INSERT INTO reward_catalog (id, name, emoji, points_required) VALUES (?, ?, ?, ?)`)
      .bind(r.id, r.name, r.emoji, r.points)
      .run();
  }

  const sharma = dealers.find((d) => d.id === "dlr-sharma")!;
  await db
    .prepare(
      `INSERT INTO points_ledger (id, dealer_id, delta, balance_after, label, occurred_at) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind("pl-init", "dlr-sharma", sharma.rewardPoints, sharma.rewardPoints, "Opening balance", nowIso())
    .run();

  for (const claim of seedDealerRewardClaims.filter((c) => c.dealerId === "dlr-sharma")) {
    await db
      .prepare(
        `INSERT INTO reward_claims (id, dealer_id, name, emoji, points_spent, status, claimed_at, delivered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        claim.id,
        claim.dealerId,
        claim.name,
        claim.emoji,
        claim.points,
        claim.status,
        claim.claimedAt,
        claim.deliveredAt ?? null,
      )
      .run();
  }

  const orderCount = await db
    .prepare(`SELECT COUNT(*) as c FROM orders WHERE deleted_at IS NULL`)
    .first<{ c: number }>();

  if ((orderCount?.c ?? 0) < 5) {
  for (const order of seedOrders.slice(0, 8)) {
    const placedIso = nowIso();
    await db
      .prepare(
        `INSERT INTO orders (id, dealer_id, distributor_id, placed_by_user_id, status, placed_at, customer_name, total_items, total_value)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        order.id,
        order.dealerId,
        order.distributorId,
        DEALER_USER_ID,
        order.status,
        placedIso,
        order.customerName ?? null,
        order.totalItems,
        order.totalValue,
      )
      .run();

    for (const item of order.items) {
      await db
        .prepare(
          `INSERT INTO order_items (id, order_id, product_id, product_name, size_requested, thickness, quantity, perma, mrp, dealer_price, campaign_price, free_items, points_earned, line_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          `oi-${order.id}-${item.model}`,
          order.id,
          item.model.toLowerCase().replace(/\s+/g, "-"),
          item.model,
          item.size,
          item.thickness,
          item.quantity,
          item.farma ? 1 : 0,
          item.mrp,
          item.dealerPrice,
          item.campaignPrice ?? null,
          item.freeItems ?? null,
          item.points,
          (item.campaignPrice ?? item.dealerPrice) * item.quantity,
        )
        .run();
    }

    for (const ev of order.timeline) {
      await db
        .prepare(
          `INSERT INTO order_timeline_events (id, order_id, label, occurred_at, note) VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(`te-${order.id}-${ev.label}`, order.id, ev.label, placedIso, ev.note ?? null)
        .run();
    }
  }
  }

  for (const c of seedComplaints) {
    await db
      .prepare(
        `INSERT INTO complaints (id, order_id, dealer_id, distributor_id, category, description, status, step, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        c.id,
        c.orderId,
        c.dealerId,
        c.distributorId,
        c.category,
        c.description,
        c.status,
        0,
        c.createdAt,
        c.updatedAt,
      )
      .run();
  }

  await db
    .prepare(`INSERT INTO system_settings (key, value) VALUES (?, ?)`)
    .bind("pending_reminder_hours", "2")
    .run();
}
