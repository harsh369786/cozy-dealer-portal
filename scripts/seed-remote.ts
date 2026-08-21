import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exportLocalDb } from "./export-local-db.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DB_NAME = "backrest-db";

function runD1(file: string) {
  const cmd = `npx wrangler d1 execute ${DB_NAME} --remote --file="${file}"`;
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: root, env: process.env });
}

async function main() {
  console.log("Generating local export SQL…");
  const exportFile = await exportLocalDb();

  console.log("Wiping remote demo data…");
  runD1(join(root, "scripts", "wipe-remote-demo.sql"));

  console.log("Seeding remote D1…");
  runD1(exportFile);

  console.log("Remote seed complete.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
