/**
 * Ensures production demo-login vars are present in the Nitro-generated wrangler.json.
 * Run automatically after `vite build` via package.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const wranglerPath = join(root, ".output", "server", "wrangler.json");

const wrangler = JSON.parse(readFileSync(wranglerPath, "utf8"));

const demoVars = {
  MOCK_OTP: "1",
  DEMO_LOGINS_ENABLED: "1",
};

wrangler.vars = { ...wrangler.vars, ...demoVars };
wrangler.env ??= {};
wrangler.env.production ??= {};
wrangler.env.production.vars = {
  ...wrangler.env.production.vars,
  ...demoVars,
  ENVIRONMENT: wrangler.env.production.vars?.ENVIRONMENT ?? "production",
};

writeFileSync(wranglerPath, `${JSON.stringify(wrangler, null, 2)}\n`);
console.info("[patch-wrangler] ensured DEMO_LOGINS_ENABLED and MOCK_OTP in wrangler.json");
