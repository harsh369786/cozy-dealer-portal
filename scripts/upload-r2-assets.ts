/**
 * DEPRECATED: R2 is not used by this app. Static assets live in `public/`.
 * This script is kept for reference if R2 is re-enabled later.
 *
 * Upload pre-defined static assets to an R2 bucket.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { R2_BUCKET_NAME, R2_STATIC_UPLOADS } from "./r2-static-manifest.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const dryRun = process.argv.includes("--dry-run");

/** Run wrangler via Node entry (avoids .cmd EINVAL on Windows paths with spaces). */
function runWrangler(args: string[]) {
  const wranglerJs = path.join(ROOT, "node_modules", "wrangler", "bin", "wrangler.js");
  if (existsSync(wranglerJs)) {
    execFileSync(process.execPath, [wranglerJs, ...args], { stdio: "inherit", cwd: ROOT });
    return;
  }
  execFileSync("npx", ["wrangler", ...args], { stdio: "inherit", cwd: ROOT, shell: true });
}

function uploadOne(localRel: string, key: string, contentType: string, cacheControl: string) {
  const filePath = path.join(ROOT, localRel);
  if (!existsSync(filePath)) {
    throw new Error(`Missing local file: ${localRel}`);
  }

  const args = [
    "r2",
    "object",
    "put",
    `${R2_BUCKET_NAME}/${key}`,
    "--file",
    filePath,
    "--content-type",
    contentType,
    "--cache-control",
    cacheControl,
    "--remote",
  ];

  console.log(`${dryRun ? "[dry-run] " : ""}PUT ${key} <= ${localRel}`);
  if (dryRun) return;

  runWrangler(args);
}

console.log(`Bucket: ${R2_BUCKET_NAME} (${R2_STATIC_UPLOADS.length} objects)`);
if (dryRun) console.log("Dry run — no uploads performed.\n");

let totalBytes = 0;
for (const item of R2_STATIC_UPLOADS) {
  const filePath = path.join(ROOT, item.local);
  if (existsSync(filePath)) {
    const { size } = await import("node:fs/promises").then((fs) => fs.stat(filePath));
    totalBytes += size;
  }
  uploadOne(item.local, item.key, item.contentType, item.cacheControl);
}

console.log(
  `\nDone. Uploaded ${R2_STATIC_UPLOADS.length} static assets (~${(totalBytes / 1024).toFixed(1)} KB).`,
);
console.log("Serve via Worker: /api/v1/assets/static/...");
console.log("Optional: enable R2 public access and set VITE_ASSET_BASE_URL at build time.");
