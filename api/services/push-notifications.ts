import { id, nowIso } from "../utils";
import type { ApiEnv } from "../types";
import type { CreatedNotification } from "./notifications";

export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

/**
 * P0-7: thrown when a user tries to (re)subscribe with a push endpoint that is already owned by a
 * DIFFERENT user. Route handlers map this to HTTP 403. Previously the upsert reassigned the endpoint
 * to the caller (`user_id = excluded.user_id`), letting any authenticated user hijack another user's
 * subscription row and receive their push notifications.
 */
export class PushSubscriptionConflictError extends Error {
  constructor(message = "This push endpoint is registered to another account.") {
    super(message);
    this.name = "PushSubscriptionConflictError";
  }
}

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

  // P0-7: an endpoint is globally unique to one browser/device. If it already exists under a
  // DIFFERENT user, refuse (403) rather than silently reassigning it to the caller — otherwise any
  // authenticated user could claim someone else's endpoint and start receiving their pushes.
  const existing = await db
    .prepare(`SELECT user_id FROM push_subscriptions WHERE endpoint = ?`)
    .bind(input.endpoint)
    .first<{ user_id: string }>();
  if (existing && existing.user_id !== userId) {
    throw new PushSubscriptionConflictError();
  }

  // Upsert keyed on the unique endpoint. The endpoint is either new or already owned by THIS user
  // (guaranteed by the check above + the guarded ON CONFLICT), so re-subscribing only refreshes the
  // encryption keys / timestamp — ownership (user_id) is never reassigned to a different account.
  const row = await db
    .prepare(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         updated_at = excluded.updated_at
       WHERE push_subscriptions.user_id = excluded.user_id
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

export type PushSubscriptionStatus = {
  /** The user has at least one push subscription row on the server. */
  subscribed: boolean;
  /** Whether the most recent delivery to any of the user's subscriptions succeeded (2xx). */
  lastDeliveryOk: boolean;
  /** ISO timestamp of the most recent delivery attempt across the user's subscriptions. */
  lastAttemptAt: string | null;
  lastStatus: number | null;
  count: number;
};

/**
 * Server-truth push status for a user: does a subscription row actually exist, and is push
 * demonstrably working (last delivery 2xx)? Powers the toggle's mount state and the polling
 * fallback's decision to skip the browser path.
 */
export async function getPushSubscriptionStatus(
  db: D1Database,
  userId: string,
): Promise<PushSubscriptionStatus> {
  const { results } = await db
    .prepare(
      `SELECT last_attempt_at, last_status FROM push_subscriptions
       WHERE user_id = ?
       ORDER BY last_attempt_at DESC`,
    )
    .bind(userId)
    .all<{ last_attempt_at: string | null; last_status: number | null }>();

  if (!results.length) {
    return { subscribed: false, lastDeliveryOk: false, lastAttemptAt: null, lastStatus: null, count: 0 };
  }

  // Most recent attempt across all of the user's subscriptions (rows ordered desc; nulls last
  // in SQLite's default ASC-null-first means DESC puts non-null first).
  const withAttempt = results.find((r) => r.last_attempt_at) ?? results[0]!;
  const lastStatus = withAttempt.last_status ?? null;
  return {
    subscribed: true,
    lastDeliveryOk: lastStatus != null && lastStatus >= 200 && lastStatus < 300,
    lastAttemptAt: withAttempt.last_attempt_at ?? null,
    lastStatus,
    count: results.length,
  };
}

export type PushSendResult = {
  attempted: number;
  succeeded: number;
  statuses: number[];
  skipped?: string;
};

export async function sendPushForNotifications(
  env: PushEnv,
  notifications: CreatedNotification[],
): Promise<PushSendResult> {
  const privateJwk = getPrivateJwk(env);
  if (!notifications.length || !privateJwk) {
    // Log WHY we bail so a misconfiguration is diagnosable instead of a silent no-op.
    const reason = `notifications=${notifications.length} privateJwkResolved=${Boolean(privateJwk)} hasPublic=${Boolean(env.VAPID_PUBLIC_KEY)} hasPrivate=${Boolean(env.VAPID_PRIVATE_KEY)}`;
    console.error(`[push] skip send: ${reason}`);
    return { attempted: 0, succeeded: 0, statuses: [], skipped: reason };
  }
  console.log(`[push] sending: notifications=${notifications.length}`);

  const db = env.DB;
  const adminContact = env.VAPID_SUBJECT ?? "mailto:support@backrest.in";

  // Import the signer ONCE per send (not per subscription per item). For broadcasts this
  // avoids repeated dynamic-import + module-init overhead across many recipients.
  const { buildPushHTTPRequest } = await import("@pushforge/builder");

  const byUser = new Map<string, CreatedNotification[]>();
  for (const n of notifications) {
    const list = byUser.get(n.recipientUserId) ?? [];
    list.push(n);
    byUser.set(n.recipientUserId, list);
  }

  // Collect dead endpoints (prune) and the last delivery status per endpoint (persist).
  const deadEndpoints = new Set<string>();
  // endpoint -> most recent HTTP status this run (0 = network error / exception).
  const statusByEndpoint = new Map<string, number>();

  // 1) SINGLE batched subscription lookup for ALL recipients (was one query per user — an N-query
  //    fan-out that dominated broadcast latency). Chunk the IN(...) list to stay well under D1's
  //    bound-parameter limit.
  const userIds = [...byUser.keys()];
  const subscriptionsByUser = new Map<string, Array<{ endpoint: string; p256dh: string; auth: string }>>();
  const USER_LOOKUP_CHUNK = 100;
  for (let i = 0; i < userIds.length; i += USER_LOOKUP_CHUNK) {
    const chunk = userIds.slice(i, i + USER_LOOKUP_CHUNK);
    const placeholders = chunk.map(() => "?").join(",");
    const { results } = await db
      .prepare(
        `SELECT user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${placeholders})`,
      )
      .bind(...chunk)
      .all<{ user_id: string; endpoint: string; p256dh: string; auth: string }>();
    for (const row of results) {
      const list = subscriptionsByUser.get(row.user_id) ?? [];
      list.push({ endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth });
      subscriptionsByUser.set(row.user_id, list);
    }
  }

  // 2) Build the flat list of (subscription, notificationItem) delivery pairs from the batch result.
  type DeliveryTask = {
    userId: string;
    sub: { endpoint: string; p256dh: string; auth: string };
    item: CreatedNotification;
  };
  const tasks: DeliveryTask[] = [];
  for (const [userId, items] of byUser) {
    const subs = subscriptionsByUser.get(userId) ?? [];
    for (const sub of subs) {
      for (const item of items) tasks.push({ userId, sub, item });
    }
  }

  // Deliver a single push; records status/dead-endpoint into the shared maps. Never throws.
  const deliverOne = async ({ userId, sub, item }: DeliveryTask): Promise<void> => {
    try {
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
            // Explicit icon/badge so the client shows the official BackRest mark and a
            // monochrome status-bar badge. The SW also has these as defaults; sending them
            // here lets the icon change centrally without a service-worker redeploy.
            icon: "/icons/icon-192.png",
            badge: "/icons/badge-monochrome.png",
          },
          adminContact,
        },
      });

      const response = await fetch(endpoint, { method: "POST", headers, body });
      statusByEndpoint.set(sub.endpoint, response.status);
      // 404/410 = gone/expired; 401/403 = auth/subscription no longer valid for this key —
      // in all four cases the subscription can never succeed again, so prune it.
      if (
        response.status === 404 ||
        response.status === 410 ||
        response.status === 401 ||
        response.status === 403
      ) {
        deadEndpoints.add(sub.endpoint);
        if (!response.ok && response.status !== 404 && response.status !== 410) {
          console.error(
            `[push] pruning invalid subscription: status=${response.status} host=${pushEndpointHost(sub.endpoint)} user=${userId}`,
          );
        }
      } else if (!response.ok) {
        // 413 = payload too large; 429/5xx = transient — log, keep the subscription.
        console.error(
          `[push] delivery failed: status=${response.status} host=${pushEndpointHost(sub.endpoint)} user=${userId}`,
        );
      }
    } catch (err) {
      // Network/exception — record as status 0 (unknown failure), keep the subscription.
      if (!statusByEndpoint.has(sub.endpoint)) statusByEndpoint.set(sub.endpoint, 0);
      console.error(
        `[push] send error host=${pushEndpointHost(sub.endpoint)} user=${userId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  };

  // 3) Dispatch concurrently in chunks of 10 (Promise.allSettled), so a broadcast fans out in
  //    parallel without exceeding reasonable concurrent-subrequest limits.
  const CONCURRENCY = 10;
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    await Promise.allSettled(tasks.slice(i, i + CONCURRENCY).map(deliverOne));
  }

  // Persist the delivery outcome for every attempted subscription (except the ones we're about
  // to delete). A 2xx resets failure_count; anything else increments it. This gives the client
  // fallback a way to know whether push is actually working (see push-status endpoint).
  const attemptTs = nowIso();
  const statusWrites: Promise<unknown>[] = [];
  const statuses: number[] = [];
  let succeeded = 0;
  for (const [endpoint, status] of statusByEndpoint) {
    statuses.push(status);
    const ok = status >= 200 && status < 300;
    if (ok) succeeded += 1;
    if (deadEndpoints.has(endpoint)) continue;
    statusWrites.push(
      db
        .prepare(
          `UPDATE push_subscriptions
             SET last_attempt_at = ?,
                 last_status = ?,
                 failure_count = CASE WHEN ? THEN 0 ELSE failure_count + 1 END
           WHERE endpoint = ?`,
        )
        .bind(attemptTs, status, ok ? 1 : 0, endpoint)
        .run(),
    );
  }
  if (statusWrites.length) await Promise.all(statusWrites);

  if (deadEndpoints.size) {
    await Promise.all(
      [...deadEndpoints].map((endpoint) =>
        db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).bind(endpoint).run(),
      ),
    );
  }

  console.log(
    `[push] send complete: attempted=${statusByEndpoint.size} succeeded=${succeeded} statuses=[${statuses.join(",")}]`,
  );
  return { attempted: statusByEndpoint.size, succeeded, statuses };
}

/** Host of a push endpoint for safe logging (never logs the full secret endpoint token). */
function pushEndpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return "unknown";
  }
}
