import Database from "better-sqlite3";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

type Stmt = {
  bind: (...values: unknown[]) => Stmt;
  all: <T = Record<string, unknown>>() => Promise<{ results: T[] }>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }>;
};

function wrapStatement(db: Database.Database, sql: string): Stmt {
  let bound: unknown[] = [];
  const stmt = db.prepare(sql);
  const api: Stmt = {
    bind(...values) {
      bound = values;
      return api;
    },
    async all() {
      const rows = stmt.all(...bound) as Record<string, unknown>[];
      return { results: rows };
    },
    async first() {
      const row = stmt.get(...bound) as Record<string, unknown> | undefined;
      return row ?? null;
    },
    async run() {
      const info = stmt.run(...bound);
      return {
        success: true,
        meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) },
      };
    },
  };
  return api;
}

function hasTable(db: Database.Database, name: string) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(name);
}

function hasIndex(db: Database.Database, name: string) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name = ?")
    .get(name);
}

function hasColumn(db: Database.Database, table: string, column: string) {
  return db
    .prepare(`SELECT name FROM pragma_table_info('${table}') WHERE name = ?`)
    .get(column);
}

function ensureAppMigrationsTable(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS app_migrations (id TEXT PRIMARY KEY)`);
}

function migrationApplied(db: Database.Database, id: string) {
  ensureAppMigrationsTable(db);
  return db.prepare(`SELECT id FROM app_migrations WHERE id = ?`).get(id);
}

function markMigrationApplied(db: Database.Database, id: string) {
  ensureAppMigrationsTable(db);
  db.prepare(`INSERT OR IGNORE INTO app_migrations (id) VALUES (?)`).run(id);
}

function applyMigrationFile(db: Database.Database, root: string, filename: string) {
  const path = join(root, "migrations", filename);
  if (!existsSync(path)) return;
  db.exec(readFileSync(path, "utf8"));
}

function applyTrackedMigration(db: Database.Database, root: string, id: string, filename: string) {
  if (migrationApplied(db, id)) return;
  applyMigrationFile(db, root, filename);
  markMigrationApplied(db, id);
}

export function applyPendingDevMigrations(db: Database.Database, root: string) {
  const structural: Array<{ file: string; applied: () => unknown }> = [
    { file: "0006_missing_indexes.sql", applied: () => hasIndex(db, "idx_otp_phone") },
    { file: "0007_order_items_index.sql", applied: () => hasIndex(db, "idx_order_items_order_id") },
    {
      file: "0008_campaign_images.sql",
      applied: () => hasColumn(db, "price_campaigns", "image_r2_key"),
    },
    {
      file: "0009_reward_images_complaint_orders.sql",
      applied: () => hasColumn(db, "reward_catalog", "image_r2_key"),
    },
    {
      file: "0010_unify_campaigns.sql",
      applied: () => hasColumn(db, "price_campaigns", "target_count"),
    },
    { file: "0014_dealer_visits.sql", applied: () => hasTable(db, "dealer_visits") },
    { file: "0015_push_subscriptions.sql", applied: () => hasTable(db, "push_subscriptions") },
    { file: "0016_audit_p0_p1.sql", applied: () => hasTable(db, "order_sequences") },
    {
      file: "0017_portal_ux.sql",
      applied: () => hasColumn(db, "complaints", "resolution_notes"),
    },
    { file: "0018_sqft_rates.sql", applied: () => hasTable(db, "mattress_sqft_rates") },
    {
      file: "0019_audit_v4.sql",
      applied: () => hasTable(db, "complaint_timeline_events"),
    },
    {
      file: "0020_users_phone_tombstone.sql",
      applied: () => {
        const row = db
          .prepare(
            `SELECT phone FROM users WHERE deleted_at IS NOT NULL AND phone NOT LIKE '%#deleted#%' LIMIT 1`,
          )
          .get() as { phone: string } | undefined;
        return !row;
      },
    },
    {
      file: "0021_prod_readiness.sql",
      applied: () => hasIndex(db, "idx_points_ledger_order_reference"),
    },
    // P0-2/P0-3: 0022–0027 and 0029 were previously OMITTED from this list, so the dev/test schema
    // jumped 0021 -> 0028 and never applied e.g. 0027 (reward_catalog.kind). That made 0033 (which
    // reads cat.kind) fail with "no such column: cat.kind". They must run in numeric order BEFORE
    // 0028/0030 below because later migrations depend on the columns/tables they add.
    {
      file: "0022_demo_login_users.sql",
      applied: () => Boolean(db.prepare(`SELECT id FROM users WHERE id = 'user-admin'`).get()),
    },
    {
      file: "0023_product_admin_fixes.sql",
      applied: () => hasColumn(db, "product_thicknesses", "mrp"),
    },
    {
      file: "0024_order_reward_reversal.sql",
      applied: () => hasIndex(db, "idx_points_ledger_order_reversal_reference"),
    },
    {
      file: "0025_reward_claim_approved.sql",
      applied: () => hasColumn(db, "reward_claims", "approved_at"),
    },
    {
      file: "0026_complaint_number.sql",
      applied: () => hasColumn(db, "complaints", "complaint_number"),
    },
    {
      file: "0027_additional_rewards.sql",
      applied: () => hasColumn(db, "reward_catalog", "kind"),
    },
    {
      file: "0028_pricing_tiers.sql",
      applied: () => hasColumn(db, "dealers", "pricing_tier_id"),
    },
    {
      file: "0029_complaint_indexes.sql",
      applied: () => hasIndex(db, "idx_complaints_distributor"),
    },
    {
      file: "0030_pricing_margins.sql",
      applied: () => hasColumn(db, "pricing_tier_product_prices", "dealer_margin_percent"),
    },
  ];

  for (const migration of structural) {
    if (!migration.applied()) {
      applyMigrationFile(db, root, migration.file);
    }
  }

  applyTrackedMigration(db, root, "0011_clear_legacy_image_urls", "0011_clear_legacy_image_urls.sql");
  applyTrackedMigration(db, root, "0012_fix_campaign_dates", "0012_fix_campaign_dates.sql");
  applyTrackedMigration(db, root, "0013_fix_product_guarantees", "0013_fix_product_guarantees.sql");

  // 0031–0041: keep the local dev DB in sync with the migrations that shipped after 0030. These are
  // guarded structurally (column/table/index existence) so they only run when actually missing —
  // matching the "run if not already applied" contract. All are ADD-only and safe to re-check.
  const laterStructural: Array<{ file: string; applied: () => unknown }> = [
    {
      file: "0031_push_delivery_status.sql",
      applied: () => hasColumn(db, "push_subscriptions", "last_status"),
    },
    {
      file: "0032_scheduled_announcements.sql",
      applied: () => hasTable(db, "scheduled_announcements"),
    },
    {
      file: "0033_reward_claim_milestone_unique.sql",
      applied: () => hasColumn(db, "reward_claims", "kind"),
    },
    {
      file: "0034_user_role_overrides.sql",
      applied: () => hasTable(db, "user_role_overrides"),
    },
    {
      file: "0035_product_sqft_rates.sql",
      applied: () => hasTable(db, "product_sqft_rates"),
    },
    {
      file: "0036_demo_sales_head_user.sql",
      applied: () => Boolean(db.prepare(`SELECT id FROM users WHERE id = 'user-sales-head'`).get()),
    },
    {
      file: "0037_pincode_location.sql",
      applied: () => hasTable(db, "pincodes"),
    },
    {
      file: "0038_order_tier_snapshot.sql",
      applied: () => hasColumn(db, "order_items", "dealer_tier_id"),
    },
    {
      file: "0039_perf_indexes.sql",
      applied: () => hasIndex(db, "idx_points_ledger_dealer"),
    },
    {
      file: "0040_order_reminders_index.sql",
      applied: () => hasIndex(db, "idx_order_reminders_order_type"),
    },
    {
      file: "0041_announcements_master.sql",
      applied: () => hasTable(db, "announcements"),
    },
    {
      file: "0042_campaign_products.sql",
      applied: () => hasTable(db, "price_campaign_products"),
    },
    {
      file: "0043_whatsapp_outbox_gupshup.sql",
      applied: () => hasColumn(db, "whatsapp_outbox", "reference_id"),
    },
    {
      file: "0044_dealer_code_legacy.sql",
      applied: () => hasColumn(db, "dealers", "legacy_code"),
    },
    {
      file: "0045_reward_claim_workflow.sql",
      applied: () => hasColumn(db, "reward_claims", "workflow_status"),
    },
    {
      file: "0046_notification_send_events.sql",
      applied: () => hasTable(db, "notification_send_events"),
    },
  ];

  for (const migration of laterStructural) {
    if (!migration.applied()) {
      applyMigrationFile(db, root, migration.file);
    }
  }
}

export function createD1DatabaseAdapter(db: Database.Database): D1Database {
  return {
    prepare(sql: string) {
      return wrapStatement(db, sql);
    },
    async batch(statements: D1PreparedStatement[]) {
      const results = [];
      const tx = db.transaction(() => {
        for (const s of statements) {
          results.push((s as unknown as Stmt).run());
        }
      });
      tx();
      return Promise.all(results);
    },
    async exec(sql: string) {
      db.exec(sql);
      return { count: 0, duration: 0 };
    },
  } as D1Database;
}

export async function createDevDatabase(): Promise<D1Database> {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const dbPath = join(root, ".local.db");
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  const migrationPath = join(root, "migrations", "0001_initial.sql");
  const hasUsersTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
    .get();
  if (!hasUsersTable && existsSync(migrationPath)) {
    const migration = readFileSync(migrationPath, "utf8");
    db.exec(migration);
  }

  const hasUsersTableAfter = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
    .get();
  if (!hasUsersTableAfter) {
    throw new Error("Failed to initialize local database schema");
  }

  const migration2Path = join(root, "migrations", "0002_order_status_rewards_campaigns.sql");
  const hasRewardPercent = db
    .prepare("SELECT name FROM pragma_table_info('product_prices') WHERE name = 'reward_percent'")
    .get();
  if (!hasRewardPercent && existsSync(migration2Path)) {
    const migration2 = readFileSync(migration2Path, "utf8");
    db.exec(migration2);
  }

  const migration3Path = join(root, "migrations", "0003_dealer_assignments.sql");
  const hasSalesExecutiveCol = db
    .prepare("SELECT name FROM pragma_table_info('dealers') WHERE name = 'sales_executive_user_id'")
    .get();
  if (!hasSalesExecutiveCol && existsSync(migration3Path)) {
    const migration3 = readFileSync(migration3Path, "utf8");
    db.exec(migration3);
  } else if (hasSalesExecutiveCol) {
    db.prepare(`UPDATE dealers SET distributor_id = NULL WHERE id = 'dlr-menon'`).run();
    db.prepare(`UPDATE dealers SET sales_executive_user_id = NULL WHERE id = 'dlr-gupta'`).run();
  }

  const migration4Path = join(root, "migrations", "0004_performance_indexes.sql");
  const hasOrderItemsIndex = db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_order_items_order'")
    .get();
  if (!hasOrderItemsIndex && existsSync(migration4Path)) {
    const migration4 = readFileSync(migration4Path, "utf8");
    db.exec(migration4);
  }

  const migration5Path = join(root, "migrations", "0005_signup_user_status.sql");
  const hasPendingApprovalStatus = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='users' AND sql LIKE '%pending_approval%'",
    )
    .get();
  if (!hasPendingApprovalStatus && existsSync(migration5Path)) {
    const migration5 = readFileSync(migration5Path, "utf8");
    db.exec(migration5);
  }

  applyPendingDevMigrations(db, root);

  const seeded = db.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number };
  const d1 = createD1DatabaseAdapter(db);
  if (seeded.c === 0) {
    try {
      const { runSeed } = await import("../../scripts/seed-data.ts");
      await runSeed(d1);
    } catch (error) {
      console.warn("[db] Full seed failed, using minimal auth seed:", error);
      const { runMinimalSeed } = await import("./minimal-seed.ts");
      await runMinimalSeed(d1);
    }
  }

  const { ensureRbacTestUsers } = await import("./rbac-test-users.ts");
  await ensureRbacTestUsers(d1);

  return d1;
}
