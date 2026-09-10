/**
/**
 * Ensures production demo-login vars + Gupshup/WhatsApp config are present in the
 * Nitro-generated wrangler.json. Run automatically after `vite build` via package.json.
 *
 * Nitro does NOT copy [env.production.vars] from wrangler.toml into the generated
 * .output/server/wrangler.json, so a CLI deploy would otherwise ship EMPTY values and
 * wipe whatever is set on the live Worker. We read the GUPSHUP_ and WHATSAPP_ values from
 * wrangler.toml and inject only the NON-EMPTY ones, so deploys preserve config and never
 * clobber a live value with a blank.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const wranglerPath = join(root, ".output", "server", "wrangler.json");
const tomlPath = join(root, "wrangler.toml");

const wrangler = JSON.parse(readFileSync(wranglerPath, "utf8"));

const demoVars = {
  MOCK_OTP: "1",
  DEMO_LOGINS_ENABLED: "1",
};

// Parse the [env.production.vars] block out of wrangler.toml (simple KEY = "value" lines).
function readProdVars() {
  let toml = "";
  try {
    toml = readFileSync(tomlPath, "utf8");
  } catch {
    return {};
  }
  const lines = toml.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === "[env.production.vars]");
  if (start === -1) return {};
  const vars = {};
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("[")) break; // next table section
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*"(.*)"\s*$/);
    if (m) vars[m[1]] = m[2];
  }
  return vars;
}

// Only carry over the Gupshup/WhatsApp keys, and only when non-empty, so a blank in the
// toml never overwrites a value already set on the live Worker.
const prodVars = readProdVars();
const carryPrefixes = ["GUPSHUP_", "WHATSAPP_"];
const carried = {};
for (const [k, v] of Object.entries(prodVars)) {
  if (carryPrefixes.some((p) => k.startsWith(p)) && v !== "") carried[k] = v;
}

wrangler.vars = { ...wrangler.vars, ...demoVars };
wrangler.env ??= {};
wrangler.env.production ??= {};
wrangler.env.production.vars = {
  ...wrangler.env.production.vars,
  ...carried,
  ...demoVars,
  ENVIRONMENT: wrangler.env.production.vars?.ENVIRONMENT ?? "production",
};

writeFileSync(wranglerPath, `${JSON.stringify(wrangler, null, 2)}\n`);
const carriedKeys = Object.keys(carried);
console.info(
  `[patch-wrangler] ensured DEMO_LOGINS_ENABLED + MOCK_OTP; carried ${carriedKeys.length} Gupshup/WhatsApp var(s): ${carriedKeys.join(", ") || "(none)"}`,
);
