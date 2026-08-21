import { AppError } from "../errors";

export const MAX_IMAGE_BYTES = 768 * 1024;

const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

function estimateBase64Bytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export function validateImageDataUrl(dataUrl: string): { mime: string; bytes: number } {
  const match = DATA_URL_RE.exec(dataUrl.trim());
  if (!match) throw new AppError("Image must be JPEG, PNG, or WebP (base64 data URL)", 400);
  const mime = match[1]!;
  const bytes = estimateBase64Bytes(match[2]!);
  if (!ALLOWED_MIMES.has(mime)) throw new AppError("Image must be JPEG, PNG, or WebP", 400);
  if (bytes > MAX_IMAGE_BYTES) {
    throw new AppError(`Image must be ${Math.round(MAX_IMAGE_BYTES / 1024)}KB or smaller`, 400);
  }
  return { mime, bytes };
}

/** Normalize image_url before persisting; strips broken legacy proxy paths. */
export function normalizeStoredImageUrl(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/api/v1/")) return null;
  if (trimmed.startsWith("data:")) {
    validateImageDataUrl(trimmed);
    return trimmed;
  }
  if (/^https?:\/\//.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  return trimmed;
}

export async function fileToImageDataUrl(file: File): Promise<string> {
  const mime = file.type;
  if (!ALLOWED_MIMES.has(mime)) {
    throw new AppError("Image must be JPEG, PNG, or WebP", 400);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new AppError(`Image must be ${Math.round(MAX_IMAGE_BYTES / 1024)}KB or smaller`, 400);
  }
  const buffer = await file.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);
  const dataUrl = `data:${mime};base64,${base64}`;
  validateImageDataUrl(dataUrl);
  return dataUrl;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
