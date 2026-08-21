/**
 * Build square PWA icons from the horizontal BackRest logo banner.
 * The logo JPEG is wide — scaling it as a square caused letterbox "bars".
 * We scale to full width and center vertically on cream (#F7F1E6), like the login page.
 *
 * Run: npm run pwa:icons
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "public", "backrest-logo.jpeg");
const iconsDir = join(root, "public", "icons");
/** Matches manifest theme_color / app background */
const BACKGROUND = { r: 247, g: 241, b: 230 };

await mkdir(iconsDir, { recursive: true });

/** Scale horizontal logo to target width; center on square cream canvas. */
async function buildIcon(size, widthRatio) {
  const logoWidth = Math.round(size * widthRatio);
  const logo = await sharp(source)
    .trim({ threshold: 12 })
    .resize({ width: logoWidth, withoutEnlargement: false })
    .flatten({ background: BACKGROUND })
    .png()
    .toBuffer();

  return sharp({
    create: { width: size, height: size, channels: 3, background: BACKGROUND },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const outputs = [
  { size: 192, widthRatio: 0.9, file: "icon-192.png" },
  { size: 512, widthRatio: 0.9, file: "icon-512.png" },
  { size: 512, widthRatio: 0.72, file: "icon-maskable-512.png" },
  { size: 180, widthRatio: 0.9, file: "apple-touch-icon.png" },
  { size: 32, widthRatio: 0.9, file: null },
];

for (const { size, widthRatio, file } of outputs) {
  const png = await buildIcon(size, widthRatio);
  const out = file ? join(iconsDir, file) : join(root, "public", "favicon.png");
  await writeFile(out, png);
  console.log(`Wrote ${out} (${png.length} bytes)`);
}

console.log("PWA icons generated (horizontal logo, cream square canvas)");
