import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createD1DatabaseAdapter, applyPendingDevMigrations } from "../api/db/sqlite-d1.ts";
import { handleApiRequest } from "../api/app.ts";
import { assertStatusUpdate } from "../api/order-status.ts";
import { listAdminCampaigns } from "../api/services/campaigns-admin.ts";
import { listOrders } from "../api/services/orders.ts";
import { redeemRewardClaim } from "../api/services/reward-redemption.ts";
import { undoRewardClaim } from "../api/services/rewards-admin.ts";
import { reviewSignupApplication } from "../api/services/signup-review.ts";
import { verifyOtp } from "../api/services/otp.ts";
import { nextOrderId, sha256 } from "../api/utils.ts";
import type { ApiEnv, SessionUser } from "../api/types.ts";

const sqlite = new Database(":memory:");
// Apply the FULL migration set (not a hardcoded subset that drifted out of date and left the test
// missing later columns like reward_claims.kind from 0033). The base migrations 0001–0005 build the
// core schema; applyPendingDevMigrations then applies 0006–0041 in order with the same guards the
// dev runtime uses. This keeps the test schema in lockstep with production going forward.
const migrationsRoot = process.cwd();
for (const migration of [
  "0001_initial.sql",
  "0002_order_status_rewards_campaigns.sql",
  "0003_dealer_assignments.sql",
  "0004_performance_indexes.sql",
  "0005_signup_user_status.sql",
]) {
  sqlite.exec(readFileSync(join(migrationsRoot, "migrations", migration), "utf8"));
}
applyPendingDevMigrations(sqlite, migrationsRoot);
const db = createD1DatabaseAdapter(sqlite);

sqlite.exec(`
  INSERT INTO distributors (id, name, region, phone)
  VALUES ('dist-test', 'Test Distributor', 'Test', '+910000000001');
  INSERT INTO dealers (id, distributor_id, code, store_name, location, phone)
  VALUES ('dealer-test', 'dist-test', 'TEST', 'Test Dealer', 'Test', '+910000000002');
  INSERT INTO users (id, phone, name, role, dealer_id, status)
  VALUES ('dealer-user', '+910000000002', 'Dealer User', 'dealer', 'dealer-test', 'active');
`);

async function testAtomicOrderIds() {
  const reference = new Date("2026-08-27T06:30:00.000Z");
  const ids = await Promise.all(Array.from({ length: 20 }, () => nextOrderId(db, reference)));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids[0], "BR-27082601");
  assert.equal(ids.at(-1), "BR-27082620");
}

async function testAtomicRewardRedemptionAndUndo() {
  sqlite
    .prepare(
      `INSERT INTO points_ledger
       (id, dealer_id, delta, balance_after, label, reference_type, reference_id, occurred_at)
       VALUES ('points-seed', 'dealer-test', 100, 100, 'Seed', 'seed', 'seed', datetime('now'))`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO reward_catalog (id, name, emoji, points_required)
       VALUES ('reward-test', 'Test Reward', 'gift', 100)`,
    )
    .run();
  const reward = { id: "reward-test", name: "Test Reward", emoji: "gift", points_required: 100 };
  const attempts = await Promise.allSettled([
    redeemRewardClaim(db, "dealer-test", reward),
    redeemRewardClaim(db, "dealer-test", reward),
  ]);
  assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM reward_claims").get().count, 1);
  assert.equal(
    sqlite
      .prepare("SELECT SUM(delta) AS balance FROM points_ledger WHERE dealer_id = 'dealer-test'")
      .get().balance,
    0,
  );

  const successful = attempts.find(
    (result): result is PromiseFulfilledResult<{ claimId: string; claimedAt: string }> =>
      result.status === "fulfilled",
  );
  assert.ok(successful);
  await undoRewardClaim(db, successful.value.claimId, "dealer-user");
  assert.equal(
    sqlite
      .prepare("SELECT SUM(delta) AS balance FROM points_ledger WHERE dealer_id = 'dealer-test'")
      .get().balance,
    100,
  );

  sqlite
    .prepare(
      `INSERT INTO reward_claims
       (id, dealer_id, reward_catalog_id, name, emoji, points_spent, status, claimed_at)
       VALUES ('delivered-claim', 'dealer-test', NULL, 'Delivered', 'gift', 50, 'delivered', datetime('now'))`,
    )
    .run();
  await assert.rejects(
    () => undoRewardClaim(db, "delivered-claim", "dealer-user"),
    /Only pending claims/,
  );
}

function testDeliveryTransitionPolicy() {
  const distributor: SessionUser = {
    id: "dist-user",
    name: "Distributor",
    phone: "+910000000003",
    role: "distributor",
    status: "active",
    distributorId: "dist-test",
    permissions: ["orders:read", "orders:deliver"],
  };
  assert.throws(
    () => assertStatusUpdate(distributor, "approved", "delivered"),
    /Cannot change status/,
  );
  assert.doesNotThrow(() => assertStatusUpdate(distributor, "out_for_delivery", "delivered"));
}

async function testSignupEscalationGuard() {
  sqlite.exec(`
    INSERT INTO users (id, phone, name, role, status)
    VALUES ('pending-user', '+910000000004', 'Pending User', 'dealer', 'pending_approval');
    INSERT INTO signup_applications
      (id, user_id, name, birthday, store_name, phone, address, distributor_name, status)
    VALUES
      ('signup-test', 'pending-user', 'Pending User', '1990-01-01', 'Pending Store', '+910000000004',
       'Test Address', 'Test Distributor', 'pending');
  `);
  await assert.rejects(
    () =>
      reviewSignupApplication(
        db,
        "signup-test",
        { action: "approve", role: "admin_staff" },
        { id: "staff-user", role: "admin_staff" },
      ),
    /only a master admin/,
  );
}

async function testOtpPrivacyAndRateLimit() {
  const phone = "+910000000099";
  sqlite
    .prepare(
      `INSERT INTO otp_challenges (id, phone, code_hash, expires_at)
       VALUES ('otp-test', ?, ?, ?)`,
    )
    .run(phone, await sha256("123456"), new Date(Date.now() + 10 * 60 * 1000).toISOString());
  await assert.rejects(() => verifyOtp(db, phone, "123456"), /Invalid OTP/);

  const env = {
    DB: db,
    ENVIRONMENT: "staging",
    OTP_IP_RATE_LIMITER: { limit: async () => ({ success: false }) },
    OTP_PHONE_RATE_LIMITER: { limit: async () => ({ success: true }) },
  } satisfies ApiEnv;
  const response = await handleApiRequest(
    new Request("https://portal.example/api/v1/auth/otp/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone }),
    }),
    env,
  );
  assert.equal(response.status, 429);
}

async function testFilteredOrderAggregates() {
  sqlite.exec(`
    INSERT INTO orders
      (id, dealer_id, distributor_id, placed_by_user_id, status, placed_at, total_items, total_value)
    VALUES
      ('order-a', 'dealer-test', 'dist-test', 'dealer-user', 'approved', '2026-08-01T00:00:00.000Z', 1, 120),
      ('order-b', 'dealer-test', 'dist-test', 'dealer-user', 'approved', '2026-08-02T00:00:00.000Z', 1, 180);
    INSERT INTO order_items
      (id, order_id, product_id, product_name, quantity, mrp, dealer_price, points_earned, line_total)
    VALUES
      ('item-a', 'order-a', 'product-a', 'Product A', 1, 150, 120, 12, 120),
      ('item-b', 'order-b', 'product-b', 'Product B', 1, 200, 180, 18, 180);
  `);
  const result = await listOrders(db, {
    dealerIds: ["dealer-test"],
    fromDate: "2026-08-01",
    toDate: "2026-08-31",
    page: 1,
    pageSize: 1,
  });
  assert.ok(!Array.isArray(result));
  assert.equal(result.total, 2);
  assert.deepEqual(result.summary, { totalSales: 300, totalPoints: 30 });
  assert.equal(result.items.length, 1);
}

async function testCampaignSqlPagination() {
  sqlite.exec(`
    INSERT INTO products (id, name, category, guarantee)
    VALUES ('campaign-product', 'Campaign Product', 'Mattresses', '5 years');
    INSERT INTO price_campaigns
      (id, name, product_id, discount_percent, start_at, end_at, description, status)
    VALUES
      ('campaign-a', 'August Offer', 'campaign-product', 10, '2026-08-01', '2099-08-31', 'Offer A', 'active'),
      ('campaign-b', 'September Offer', 'campaign-product', 15, '2099-09-01', '2099-09-30', 'Offer B', 'active');
  `);
  const result = await listAdminCampaigns(db, { search: "Offer", page: 1, pageSize: 1 });
  assert.equal(result.total, 2);
  assert.equal(result.items.length, 1);
}

await testAtomicOrderIds();
await testAtomicRewardRedemptionAndUndo();
testDeliveryTransitionPolicy();
await testSignupEscalationGuard();
await testOtpPrivacyAndRateLimit();
await testFilteredOrderAggregates();
await testCampaignSqlPagination();

console.info("P0/P1 audit regression checks passed");
