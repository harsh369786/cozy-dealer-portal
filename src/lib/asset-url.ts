/**

 * Centralized static asset URLs.

 *

 * Default: files in `public/` served at same-origin paths (e.g. `/backrest-logo.jpeg`).

 * Optional override: set `VITE_ASSET_BASE_URL` to a CDN base (no trailing slash) at build time.

 */



const ASSET_BASE = (import.meta.env.VITE_ASSET_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";



/** Static asset paths under `public/`. */

export const STATIC_ASSET_PATHS = {

  products: {

    mattressPremium: "/products/mattress-premium.jpg",

    pillowMemory: "/products/pillow-memory.jpg",

    cushionSupport: "/products/cushion-support.jpg",

  },

  brand: {

    loginBg: "/brand/login-bg.jpg",

    logo: "/backrest-logo.jpeg",

  },

} as const;



/** @deprecated Use STATIC_ASSET_PATHS */

export const STATIC_ASSET_KEYS = STATIC_ASSET_PATHS;



const LEGACY_PATH_MAP: Record<string, string> = {

  "/backrest-logo.jpeg": STATIC_ASSET_PATHS.brand.logo,

  "/src/assets/mattress-premium.jpg": STATIC_ASSET_PATHS.products.mattressPremium,

  "/src/assets/pillow-memory.jpg": STATIC_ASSET_PATHS.products.pillowMemory,

  "/src/assets/cushion-support.jpg": STATIC_ASSET_PATHS.products.cushionSupport,

  "static/products/mattress-premium.jpg": STATIC_ASSET_PATHS.products.mattressPremium,

  "static/products/pillow-memory.jpg": STATIC_ASSET_PATHS.products.pillowMemory,

  "static/products/cushion-support.jpg": STATIC_ASSET_PATHS.products.cushionSupport,

  "static/brand/login-bg.jpg": STATIC_ASSET_PATHS.brand.loginBg,

  "static/brand/backrest-logo.jpeg": STATIC_ASSET_PATHS.brand.logo,

};



function withAssetBase(path: string): string {

  const normalized = path.startsWith("/") ? path : `/${path}`;

  if (ASSET_BASE) return `${ASSET_BASE}${normalized}`;

  return normalized;

}



/** Build a public URL for a static asset path (e.g. `/products/foo.jpg`). */

export function assetPublicPath(path: string): string {

  return withAssetBase(path);

}



/**

 * Resolve any stored image reference to a browser-loadable URL.

 * Accepts full URLs, local public paths, or legacy seed/R2 references.

 */

export function resolveAssetUrl(url: string | undefined | null): string {

  if (!url) return "";

  if (/^https?:\/\//.test(url) || url.startsWith("data:")) return url;

  if (url.startsWith("/api/v1/campaign-images/")) return "";

  if (url.startsWith("/api/v1/assets/")) {
    const key = decodeURIComponent(url.replace(/^\/api\/v1\/assets\//, ""));
    const mapped = LEGACY_PATH_MAP[key];
    if (mapped) return withAssetBase(mapped);
    return "";
  }



  const mapped = LEGACY_PATH_MAP[url] ?? LEGACY_PATH_MAP[url.replace(/^\//, "")];

  if (mapped) return withAssetBase(mapped);



  if (url.startsWith("static/")) {

    const staticMapped = LEGACY_PATH_MAP[url];

    if (staticMapped) return withAssetBase(staticMapped);

  }



  return withAssetBase(url);

}


