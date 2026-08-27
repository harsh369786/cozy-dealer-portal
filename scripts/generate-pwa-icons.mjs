/**
 * Resize PWA icons from the square 512×512 maskable source.
 * Source: public/icons/icon-512-maskable.png (full-bleed cream + BackRest mark)
 *
 * Run: npm run pwa:icons
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "public", "icons", "icon-512-maskable.png");
const iconsDir = join(root, "public", "icons");

await mkdir(iconsDir, { recursive: true });

const meta = await sharp(source).metadata();
const needsNormalize = meta.width !== 512 || meta.height !== 512;
if (needsNormalize) {
  console.log(`Normalizing maskable source from ${meta.width}×${meta.height} to 512×512`);
  const normalized = await sharp(source)
    .resize(512, 512, { fit: "cover" })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(source, normalized);
}

async function resizeTo(size) {
  return sharp(source)
    .resize(size, size, { fit: "cover" })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const outputs = [
  { size: 192, file: "icon-192.png" },
  { size: 512, file: "icon-512.png" },
  { size: 180, file: "apple-touch-icon.png" },
  { size: 32, file: null },
];

for (const { size, file } of outputs) {
  const png = await resizeTo(size);
  const out = file ? join(iconsDir, file) : join(root, "public", "favicon.png");
  await writeFile(out, png);
  console.log(`Wrote ${out} (${png.length} bytes, ${size}×${size})`);
}

console.log("PWA icons generated from icon-512-maskable.png");
