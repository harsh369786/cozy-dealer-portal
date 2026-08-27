/**
 * Adds ~4 months of historical demo data for reports (Apr–Jul 2026).
 * Safe to re-run: skips if historical orders already exist.
 */
import { dealers, DISTRIBUTOR_ID } from "../src/lib/mock/distributor/data.ts";
import { id } from "../api/utils.ts";

const DEALER_USER_ID = "user-dealer-sharma";
const SALES_EXEC_USER_ID = "user-sales-exec";

const MONTH_OFFSETS = [
  { label: "Apr", month: 3, year: 2026, factor: 0.72 },
  { label: "May", month: 4, year: 2026, factor: 0.85 },
  { label: "Jun", month: 5, year: 2026, factor: 0.94 },
  { label: "Jul", month: 6, year: 2026, factor: 1.0 },
];

function randomDay(year: number, month: number) {
  const day = 3 + Math.floor(Math.random() * 25);
  const hour = 9 + Math.floor(Math.random() * 9);
  const minute = Math.floor(Math.random() * 60);
  return new Date(year, month, day, hour, minute, 0).toISOString();
}

function pickProduct(catalog: Array<{ id: string; name: string; price: number; mrp: number; points: number }>) {
  const p = catalog[Math.floor(Math.random() * catalog.length)]!;
  const thickness = "6";
  const qty = 1 + Math.floor(Math.random() * 2);
  const unit = p.price;
  return {
    model: p.name,
    productId: p.id,
    size: "75 × 60",
    thickness,
    quantity: qty,
    mrp: p.mrp,
    dealerPrice: p.price,
    points: Math.round(p.points * qty),
    lineTotal: unit * qty,
  };
}

const STATUSES = ["delivered", "delivered", "delivered", "approved", "in_making", "out_for_delivery"] as const;

export async function seedHistoricalDemoData(db: D1Database) {
  const existing = await db
    .prepare(
      `SELECT COUNT(*) as c FROM orders
       WHERE deleted_at IS NULL AND placed_at < datetime('now', '-25 days')`,
    )
    .first<{ c: number }>();
  if ((existing?.c ?? 0) >= 15) return { skipped: true, reason: "historical orders exist" };

  const { results: productRows } = await db
    .prepare(
      `SELECT p.id, p.name, pp.dealer_price as price, pp.mrp, pp.points
       FROM products p
       JOIN product_prices pp ON pp.product_id = p.id
       WHERE p.deleted_at IS NULL
       LIMIT 40`,
    )
    .all<{ id: string; name: string; price: number; mrp: number; points: number }>();
  if (productRows.length === 0) return { skipped: true, reason: "no products in database" };

  const activeDealers = dealers.filter((d) => d.active && d.distributorId);
  let orderSeq = 9000;

  for (const period of MONTH_OFFSETS) {
    for (const dealer of activeDealers) {
      const baseOrders = 2 + Math.floor(Math.random() * 3);
      const orderCount = Math.max(1, Math.round(baseOrders * period.factor));

      for (let i = 0; i < orderCount; i++) {
        orderSeq += 1;
        const orderId = `BR-H${period.label}${orderSeq}`;
        const placedAt = randomDay(period.year, period.month);
        const item = pickProduct(productRows);
        const totalValue = item.lineTotal + (Math.random() > 0.6 ? Math.round(item.lineTotal * 0.4) : 0);
        const status = STATUSES[Math.floor(Math.random() * STATUSES.length)];

        await db
          .prepare(
            `INSERT OR IGNORE INTO orders (
              id, dealer_id, distributor_id, placed_by_user_id, status, placed_at,
              customer_name, total_items, total_value, approved_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            orderId,
            dealer.id,
            dealer.distributorId ?? DISTRIBUTOR_ID,
            DEALER_USER_ID,
            status,
            placedAt,
            `Customer ${orderSeq}`,
            item.quantity,
            totalValue,
            status !== "order_placed" ? placedAt : null,
          )
          .run();

        await db
          .prepare(
            `INSERT OR IGNORE INTO order_items (
              id, order_id, product_id, product_name, size_requested, thickness, quantity,
              mrp, dealer_price, points_earned, line_total
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            `oi-${orderId}`,
            orderId,
            item.productId,
            item.model,
            item.size,
            item.thickness,
            item.quantity,
            item.mrp,
            item.dealerPrice,
            item.points,
            item.lineTotal,
          )
          .run();

        await db
          .prepare(
            `INSERT OR IGNORE INTO order_timeline_events (id, order_id, label, status_key, occurred_at)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(`te-${orderId}-placed`, orderId, "Order Placed", "order_placed", placedAt)
          .run();
      }
    }
  }

  // Historical points ledger entries (Sharma dealer)
  for (const period of MONTH_OFFSETS) {
    const occurredAt = new Date(period.year, period.month, 15).toISOString();
    const delta = Math.round(800 + period.factor * 1200);
    await db
      .prepare(
        `INSERT OR IGNORE INTO points_ledger (id, dealer_id, delta, balance_after, label, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        `pl-hist-${period.label}`,
        "dlr-sharma",
        delta,
        20000 + delta,
        `${period.label} 2026 reward points`,
        occurredAt,
      )
      .run();
  }

  // Historical complaints spread across months
  const complaintDealers = activeDealers.slice(0, 5);
  let cmpSeq = 100;
  for (const period of MONTH_OFFSETS) {
    if (Math.random() > 0.5) continue;
    const dealer = complaintDealers[Math.floor(Math.random() * complaintDealers.length)]!;
    cmpSeq += 1;
    const createdAt = new Date(period.year, period.month, 10).toISOString();
    await db
      .prepare(
        `INSERT OR IGNORE INTO complaints (
          id, order_id, dealer_id, distributor_id, category, description, status, step, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .bind(
        `CMP-H${cmpSeq}`,
        `BR-H${period.label}${9000 + cmpSeq}`,
        dealer.id,
        dealer.distributorId ?? DISTRIBUTOR_ID,
        "Delivery",
        `Demo complaint from ${period.label} 2026 — delayed delivery reported.`,
        period.factor < 0.9 ? "resolved" : "pending",
        createdAt,
        createdAt,
      )
      .run();
  }

  // Demo completed visits for Sales Executive
  const visitCount = await db.prepare(`SELECT COUNT(*) as c FROM dealer_visits`).first<{ c: number }>();
  if ((visitCount?.c ?? 0) === 0) {
    const demoVisits = [
      {
        dealerName: "Rajesh Sharma",
        storeName: "Sharma Furnishings",
        address: "Shop 14, Sitabuldi Main Road, Nagpur 440001",
        mobile: "+919876543210",
        daysAgo: 12,
        durationMin: 45,
        notes: "Discussed Orthomatic restock. Dealer wants 10 units next week. Follow-up on Friday.",
        inLat: 21.1458,
        inLng: 79.0882,
      },
      {
        dealerName: "Sunil Patil",
        storeName: "Patil Mattress Gallery",
        address: "45, Dharampeth Extension, Nagpur 440010",
        mobile: "+919765422108",
        daysAgo: 8,
        durationMin: 30,
        notes: "Showed new Latexo campaign. Dealer interested in pillow bundle offer.",
        inLat: 21.1369,
        inLng: 79.0722,
      },
      {
        dealerName: "Vikram Desai",
        storeName: "Desai Furnishing World",
        address: "Ring Road, Ahmedabad",
        mobile: "+919823011223",
        daysAgo: 3,
        durationMin: 55,
        notes: "Potential large order for monsoon season. Needs distributor approval on pricing.",
        inLat: 23.0225,
        inLng: 72.5714,
      },
    ];

    for (const v of demoVisits) {
      const visitId = id("VIS");
      const checkIn = new Date(Date.now() - v.daysAgo * 86400000);
      const checkOut = new Date(checkIn.getTime() + v.durationMin * 60000);
      await db
        .prepare(
          `INSERT INTO dealer_visits (
            id, sales_executive_user_id, dealer_name, store_name, address, mobile,
            status, check_in_at, check_out_at, check_in_lat, check_in_lng,
            check_out_lat, check_out_lng, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          visitId,
          SALES_EXEC_USER_ID,
          v.dealerName,
          v.storeName,
          v.address,
          v.mobile,
          checkIn.toISOString(),
          checkOut.toISOString(),
          v.inLat,
          v.inLng,
          v.inLat + 0.001,
          v.inLng + 0.001,
          v.notes,
          checkIn.toISOString(),
          checkOut.toISOString(),
        )
        .run();
    }
  }

  return { skipped: false, ordersAdded: orderSeq - 9000 };
}
