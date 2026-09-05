// Parse `pincode master.csv` (India Post master) and generate a batched INSERT .sql file for the
// `pincodes` D1 table (migration 0037). Run: node scripts/generate-pincodes-sql.mjs
//
// CSV columns used: officename -> area, pincode -> pincode, district -> district, statename -> state.
// Rows are deduped on (pincode, area). Output is UTF-8 with NO BOM and split into multi-row INSERTs
// so it can be applied with:  wrangler d1 execute backrest-db --local|--remote --config wrangler.toml --file scripts/pincodes.generated.sql
//
// We title-case state/district/area (the source is ALL CAPS) for clean display, but keep it simple.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const INPUT = join(ROOT, "pincode master.csv");
const OUTPUT = join(ROOT, "scripts", "pincodes.generated.sql");

const ROWS_PER_INSERT = 500; // multi-row VALUES per statement

/** Minimal CSV line parser: handles quoted fields with embedded commas and doubled quotes. */
function parseLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** Title-case an ALL-CAPS source string for display (keeps it readable but faithful). */
function titleCase(s) {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .trim();
}

function sqlStr(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

function main() {
  const raw = readFileSync(INPUT, "utf8");
  // Split on CRLF or LF.
  const lines = raw.split(/\r?\n/);
  const header = parseLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = {
    officename: header.indexOf("officename"),
    pincode: header.indexOf("pincode"),
    district: header.indexOf("district"),
    statename: header.indexOf("statename"),
  };
  for (const [k, v] of Object.entries(idx)) {
    if (v < 0) throw new Error(`CSV missing column: ${k}`);
  }

  const seen = new Set();
  const rows = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = parseLine(line);
    const pincodeRaw = (cols[idx.pincode] ?? "").trim();
    const pincode = pincodeRaw.replace(/\D/g, "");
    const area = titleCase((cols[idx.officename] ?? "").trim());
    const district = titleCase((cols[idx.district] ?? "").trim());
    const state = titleCase((cols[idx.statename] ?? "").trim());
    if (!/^\d{6}$/.test(pincode) || !area || !district || !state) {
      skipped++;
      continue;
    }
    const key = `${pincode}|${area}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ pincode, state, district, area });
  }

  const parts = [];
  parts.push("-- Generated from `pincode master.csv` by scripts/generate-pincodes-sql.mjs");
  parts.push("-- Apply: wrangler d1 execute backrest-db --local|--remote --config wrangler.toml --file scripts/pincodes.generated.sql");
  parts.push("DELETE FROM pincodes;");
  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
    const chunk = rows.slice(i, i + ROWS_PER_INSERT);
    const values = chunk
      .map((r) => `(${sqlStr(r.pincode)},${sqlStr(r.state)},${sqlStr(r.district)},${sqlStr(r.area)})`)
      .join(",\n");
    parts.push(`INSERT INTO pincodes (pincode, state, district, area) VALUES\n${values};`);
  }

  // UTF-8, no BOM (wrangler rejects UTF-16/BOM for --file).
  writeFileSync(OUTPUT, parts.join("\n") + "\n", { encoding: "utf8" });
  console.log(`Parsed rows: ${rows.length}, skipped: ${skipped}`);
  console.log(`Wrote ${OUTPUT} (${(readFileSync(OUTPUT).length / 1024 / 1024).toFixed(1)} MB)`);
}

main();
