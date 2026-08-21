import Database from "better-sqlite3";
import { execSync } from "node:child_process";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = join(root, ".local.db");

const EXPORT_TABLES = [
  "distributors",
  "dealers",
  "users",
  "dealer_assignments",
  "products",
  "product_thicknesses",
  "product_prices",
  "product_layers",
  "product_layer_items",
  "salespeople",
  "price_campaigns",
  "sell_campaigns",
  "distributor_campaigns",
  "reward_catalog",
  "points_ledger",
  "reward_claims",
  "orders",
  "order_items",
  "order_timeline_events",
  "complaints",
  "system_settings",
] as const;

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "bigint") return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

function exportTable(db: Database.Database, table: string): string[] {
  const columns = db
    .prepare(`SELECT name FROM pragma_table_info(?) ORDER BY cid`)
    .all(table)
    .map((r) => (r as { name: string }).name);

  if (!columns.length) return [];

  const rows = db.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
  return rows.map((row) => {
    const values = columns.map((col) => sqlValue(row[col]));
    return `INSERT OR IGNORE INTO ${table} (${columns.join(", ")}) VALUES (${values.join(", ")});`;
  });
}

function writeExport(db: Database.Database, outPath?: string): string {
  const lines = [
    "-- Auto-generated demo seed export (INSERT OR IGNORE)",
    "PRAGMA foreign_keys = OFF;",
    "",
  ];

  for (const table of EXPORT_TABLES) {
    const inserts = exportTable(db, table);
    if (inserts.length) {
      lines.push(`-- ${table}`);
      lines.push(...inserts);
      lines.push("");
    }
  }

  lines.push("PRAGMA foreign_keys = ON;");
  db.close();

  const target = outPath ?? join(root, "scripts", "seed-remote-export.sql");
  writeFileSync(target, lines.join("\n"), "utf8");
  console.log(`Exported ${EXPORT_TABLES.length} tables to ${target}`);
  return target;
}

export async function exportLocalDb(outPath?: string): Promise<string> {
  let skipReseed = false;

  if (existsSync(dbPath)) {
    try {
      unlinkSync(dbPath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EBUSY" || code === "EPERM") {
        console.warn(".local.db is locked; exporting existing data without re-seeding.");
        skipReseed = true;
      } else {
        throw err;
      }
    }
  }

  if (!skipReseed) {
    execSync("npx vite-node scripts/run-seed.ts", {
      stdio: "inherit",
      cwd: root,
      env: process.env,
    });
  }

  const db = new Database(dbPath, skipReseed ? { readonly: true } : undefined);
  return writeExport(db, outPath);
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("export-local-db.ts")) {
  await exportLocalDb();
}
