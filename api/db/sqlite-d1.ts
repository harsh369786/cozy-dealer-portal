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

function createD1(db: Database.Database): D1Database {
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

  const seeded = db.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number };
  const d1 = createD1(db);
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
