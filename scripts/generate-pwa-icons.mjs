import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "public", "backrest-logo.jpeg");
const iconsDir = join(root, "public", "icons");

await mkdir(iconsDir, { recursive: true });

for (const size of [192, 512]) {
  const png = await sharp(source)
    .resize(size, size, { fit: "cover", position: "centre" })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const out = join(iconsDir, `icon-${size}.png`);
  await writeFile(out, png);
  console.log(`Wrote ${out} (${png.length} bytes)`);
}

const favicon = await sharp(source)
  .resize(32, 32, { fit: "cover", position: "centre" })
  .png({ compressionLevel: 9 })
  .toBuffer();
await writeFile(join(root, "public", "favicon.png"), favicon);
console.log("Wrote public/favicon.png");
