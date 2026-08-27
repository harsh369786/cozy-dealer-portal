/**
 * Seeds Apr–Jul 2026 historical demo data + visit records on remote D1 only.
 * Does not wipe existing data. Safe to re-run (uses INSERT OR IGNORE / skip checks).
 */
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { createDevDatabase } from "../api/db/sqlite-d1.ts";
import { seedHistoricalDemoData } from "./seed-historical-demo.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DB_NAME = "backrest-db";
const dbPath = join(root, ".local.db");

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function rowInsert(table: string, row: Record<string, unknown>) {
  const cols = Object.keys(row);
  const vals = cols.map((c) => sqlValue(row[c]));
  return `INSERT OR IGNORE INTO ${table} (${cols.join(", ")}) VALUES (${vals.join(", ")});`;
}

function shouldExport(table: string, row: Record<string, unknown>) {
  if (table === "orders") return String(row.id).startsWith("BR-H");
  if (table === "order_items") return String(row.order_id).startsWith("BR-H");
  if (table === "order_timeline_events") return String(row.order_id).startsWith("BR-H");
  if (table === "points_ledger") return String(row.id).startsWith("pl-hist-");
  if (table === "complaints") return String(row.id).startsWith("CMP-H");
  if (table === "dealer_visits") return true;
  return false;
}

async function main() {
  const migrationPath = join(root, "migrations", "0014_dealer_visits.sql");
  if (existsSync(dbPath) && existsSync(migrationPath)) {
    const sqlite = new Database(dbPath);
    const hasVisits = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='dealer_visits'")
      .get();
    if (!hasVisits) {
      sqlite.exec(readFileSync(migrationPath, "utf8"));
      console.log("Applied dealer_visits migration to local db.");
    }
    sqlite.close();
  }

  const db = await createDevDatabase();
  const result = await seedHistoricalDemoData(db);
  console.log("Local historical seed:", result);
  if (result.skipped) {
    console.log("Historical data already present locally — exporting existing rows for remote.");
  }

  const sqlite = new Database(dbPath, { readonly: true });
  const statements: string[] = [];
  let count = 0;

  for (const table of [
    "orders",
    "order_items",
    "order_timeline_events",
    "points_ledger",
    "complaints",
    "dealer_visits",
  ] as const) {
    const rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
    for (const row of rows) {
      if (!shouldExport(table, row)) continue;
      statements.push(rowInsert(table, row));
      count += 1;
    }
  }

  sqlite.close();

  if (count === 0) {
    console.log("Nothing to export.");
    return;
  }

  const outFile = join(root, ".historical-seed-remote.sql");
  writeFileSync(outFile, statements.join("\n"), "utf8");
  console.log(`Generated ${count} inserts → ${outFile}`);

  const cmd = `npx wrangler d1 execute ${DB_NAME} --remote --file="${outFile}"`;
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: root });
  unlinkSync(outFile);
  console.log("Remote historical seed complete.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
