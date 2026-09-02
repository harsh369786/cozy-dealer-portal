import { id, nowIso } from "../utils";
import type { ApiEnv } from "../types";
import type { CreatedNotification } from "./notifications";

export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

type PushEnv = ApiEnv & {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
};

let cachedPrivateJwk: JsonWebKey | null | undefined;

function base64UrlToBytes(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Std = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64Std);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Accept JWK JSON (PushForge CLI) or web-push base64url key pair already in env secrets. */
function resolvePrivateJwk(env: PushEnv): JsonWebKey | null {
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  if (!privateKey || !publicKey) return null;

  if (privateKey.startsWith("{")) {
    try {
      return JSON.parse(privateKey) as JsonWebKey;
    } catch {
      return null;
    }
  }

  try {
    const pubBytes = base64UrlToBytes(publicKey);
    if (pubBytes.length !== 65 || pubBytes[0] !== 0x04) return null;
    return {
      kty: "EC",
      crv: "P-256",
      x: bytesToBase64Url(pubBytes.slice(1, 33)),
      y: bytesToBase64Url(pubBytes.slice(33, 65)),
      d: bytesToBase64Url(base64UrlToBytes(privateKey)),
    };
  } catch {
    return null;
  }
}

function getPrivateJwk(env: PushEnv): JsonWebKey | null {
  // Only cache a successfully resolved key. Caching a null (e.g. secrets not yet set on the
  // first request, or mid-rotation) would keep push disabled for the whole isolate lifetime,
  // so we re-resolve until a key is available.
  if (cachedPrivateJwk) return cachedPrivateJwk;
  cachedPrivateJwk = resolvePrivateJwk(env);
  return cachedPrivateJwk;
}

export async function savePushSubscription(
  db: D1Database,
  userId: string,
  input: PushSubscriptionInput,
) {
  const ts = nowIso();
  const subId = id("psub");
  // Atomic upsert keyed on the unique endpoint: re-subscribing updates the keys and
  // (re)assigns the endpoint to the current user, so an endpoint is never duplicated
  // and can never be shared across users. Avoids the read-then-write race.
  const row = await db
    .prepare(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         user_id = excluded.user_id,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         updated_at = excluded.updated_at
       RETURNING id`,
    )
    .bind(subId, userId, input.endpoint, input.keys.p256dh, input.keys.auth, ts, ts)
    .first<{ id: string }>();
  return { id: row?.id ?? subId };
}

export async function deletePushSubscription(db: D1Database, userId: string, endpoint: string) {
  await db
    .prepare(`DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?`)
    .bind(userId, endpoint)
    .run();
}

export function getVapidPublicKeyFromEnv(env?: PushEnv) {
  return env?.VAPID_PUBLIC_KEY ?? null;
}

export async function sendPushForNotifications(env: PushEnv, notifications: CreatedNotification[]) {
  const privateJwk = getPrivateJwk(env);
  if (!notifications.length || !privateJwk) return;

  const db = env.DB;
  const adminContact = env.VAPID_SUBJECT ?? "mailto:support@backrest.in";
  const byUser = new Map<string, CreatedNotification[]>();
  for (const n of notifications) {
    const list = byUser.get(n.recipientUserId) ?? [];
    list.push(n);
    byUser.set(n.recipientUserId, list);
  }

  for (const [userId, items] of byUser) {
    const { results } = await db
      .prepare(`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?`)
      .bind(userId)
      .all<{ endpoint: string; p256dh: string; auth: string }>();

    for (const sub of results) {
      for (const item of items) {
        try {
          const { buildPushHTTPRequest } = await import("@pushforge/builder");
          const { endpoint, headers, body } = await buildPushHTTPRequest({
            privateJWK: privateJwk,
            subscription: {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            message: {
              payload: {
                title: item.title,
                body: item.body,
                url: item.link ?? "/",
                notificationId: item.id,
              },
              adminContact,
            },
          });

          const response = await fetch(endpoint, { method: "POST", headers, body });
          if (response.status === 404 || response.status === 410) {
            await db
              .prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`)
              .bind(sub.endpoint)
              .run();
          }
        } catch {
          // Ignore per-subscription delivery failures.
        }
      }
    }
  }
}
