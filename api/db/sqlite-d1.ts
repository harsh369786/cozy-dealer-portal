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

function applyPendingDevMigrations(db: Database.Database, root: string) {
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
    {
      file: "0028_pricing_tiers.sql",
      applied: () => hasColumn(db, "dealers", "pricing_tier_id"),
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
