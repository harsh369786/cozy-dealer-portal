/** Source files for optional R2 upload (app uses `public/` instead). */
export const R2_BUCKET_NAME = "backrest-campaign-images";

export type R2StaticUpload = {
  local: string;
  key: string;
  contentType: string;
  cacheControl: string;
};

export const R2_STATIC_UPLOADS: R2StaticUpload[] = [
  {
    local: "src/assets/mattress-premium.jpg",
    key: "static/products/mattress-premium.jpg",
    contentType: "image/jpeg",
    cacheControl: "public, max-age=31536000, immutable",
  },
  {
    local: "src/assets/pillow-memory.jpg",
    key: "static/products/pillow-memory.jpg",
    contentType: "image/jpeg",
    cacheControl: "public, max-age=31536000, immutable",
  },
  {
    local: "src/assets/cushion-support.jpg",
    key: "static/products/cushion-support.jpg",
    contentType: "image/jpeg",
    cacheControl: "public, max-age=31536000, immutable",
  },
  {
    local: "src/assets/login-bg.jpg",
    key: "static/brand/login-bg.jpg",
    contentType: "image/jpeg",
    cacheControl: "public, max-age=31536000, immutable",
  },
  {
    local: "public/backrest-logo.jpeg",
    key: "static/brand/backrest-logo.jpeg",
    contentType: "image/jpeg",
    cacheControl: "public, max-age=31536000, immutable",
  },
];
