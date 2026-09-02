# Design Document

## Overview

This design makes the existing notification system verifiably production-ready without redesigning the UI or changing intended behavior. The system already implements the target architecture (persistent inbox, event to Web Push to service worker to OS notification, no login replay). The work is therefore mostly **fix + audit + document**, split into five workstreams:

1. **Build unblock** — fix all TypeScript errors in `api/app.ts` (and any files it surfaces) with no suppressions.
2. **Web Push correctness audit** — confirm the subscribe -> persist -> event -> send -> SW -> OS -> click path in code; produce a manual verification checklist for the four app states.
3. **VAPID + subscription reliability** — confirm secret handling, graceful degradation, and endpoint lifecycle.
4. **Behavioral audits** — recipients, login/replay, click routing, test notification.
5. **Cloudflare config + final audit + report** — document exact secrets, verify SW cache versioning, run the full test suite, and write the honest production-readiness report.

## Architecture

### Current notification flow (confirmed by reading the code)

```
Event (order/campaign/complaint/reward/...)
  -> notification-events.ts (recipient resolution: role queries, excludeUserId, skipDealer, campaign eventKey dedup)
    -> notifications.ts createNotification / createNotificationsBatch
       -> INSERT into `notifications` (durable inbox)
       -> waitUntil(sendPushForNotifications(env, created))   [only if getPushEnv() returns env]
          -> push-notifications.ts: per user -> per subscription -> @pushforge/builder -> fetch(endpoint)
             -> on 404/410: DELETE subscription
  -> public/sw.js `push` handler
     -> postMessage PUSH_RECEIVED to clients (refresh unread count)
     -> if appFocused && !force: suppress OS notification; else showNotification
  -> user clicks -> `notificationclick` -> focus client + postMessage NOTIFICATION_NAVIGATE (or openWindow)
     -> use-notification-bridge.ts navigates + marks read
```

Client polling (`use-notification-bridge.ts`, `POLL_MS = 45s`) is retained ONLY for unread-count refresh and announcement popups (metadata `popupEnabled === true`). It is not a push replacement. This satisfies Requirement 2.6 and 6.

### Design principle for this work

No architectural change. Each requirement maps to either a targeted code fix (build errors, any confirmed defects) or a read-only audit that yields a documented finding. Where behavior is already correct, the deliverable is a recorded verification, not a rewrite.

## Components and Interfaces

### 1. TypeScript build fixes (`api/app.ts`, Requirement 1)

The ~60 errors fall into four mechanical categories plus one type-modeling fix. All fixes preserve runtime behavior.

**(a) Hono status code (TS2769) — line ~242, `app.onError`**
`c.json(body, err.statusCode)` fails because `AppError.statusCode` is typed as `number`, not Hono's `ContentfulStatusCode`. Fix by typing `AppError.statusCode` as `ContentfulStatusCode` (preferred, at the class definition) or narrowing at the call site with a typed cast to `ContentfulStatusCode`. Investigate the `AppError` definition first; prefer fixing the source type so all call sites benefit. Literal statuses like `400/403/404` already type-check.

**(b) Index-signature access (TS4111) — lines 383, 511, 517, 518, 521, 522, 525, 530, 531, 532, 577, 583, 584**
Rows come from D1 `.all()`/`.first()` as `Record<string, unknown>`. Change dotted access to bracket access, e.g. `layer['id']`, `item['product_id']`, `row['thickness']`. No behavior change.

**(c) Missing named properties on pricing return type (TS2339) — lines 513, 514, 544, 545 (`category`, `id`)**
`mapCatalogProductWithPricing` returns `{ ...product, ... }` where `product` is destructured from a `Record<string, unknown>`, so `category`/`id` are not on the inferred return type. Fix by giving the function an explicit return type or by typing the spread source so `id: string` and `category: string` are present. Downstream `pricedProducts.filter(p => p.category === ...)` and `String(p.id)` then type-check. No behavior change.

**(d) exactOptionalPropertyTypes (TS2379/TS2345/TS2322) — lines 395, 440, 567, 602, 660, 680-848**
Two sub-patterns:
- Values sourced from `user.dealerId` / `user.distributorId` (typed `string | undefined`) passed into params/functions expecting `string | null` or `string`. Fix by normalizing: `dealerId: user.dealerId ?? null` (or conditional spread `...(user.dealerId ? { dealerId: user.dealerId } : {})` where the target is truly optional). For functions requiring a non-optional `string`, guard/scope so the value is present (the surrounding code already role-guards, e.g. `user.role === 'dealer' && user.dealerId`).
- `default_thickness as string | undefined` passed into `applyMattressPricing({ thickness })` which expects `string | null`. Fix by coalescing to `null`.

The pricing type modeling (`distributorPrice`, `pricingTierId`, `pricingContext`, `PricingContext`, `distributorMarginPercent`, `pricingTierCode`) is reworked code; fixes there are limited to type correctness and must not change computed prices.

**Verification:** `npx tsc --noEmit` (0 errors) and `npm run build` (success).

### 2. Web Push flow audit (Requirement 2, 8-manual)

Read-only confirmation of each hop (already traced above), plus a manual checklist deliverable covering: PWA open (OS notification suppressed unless forced; `PUSH_RECEIVED` refreshes count), other tab, backgrounded, and closed (SW wakes, shows notification, click focuses/opens correct URL). `push_test` sets `force: true` so it shows even when focused.

### 3. VAPID + subscription reliability (Requirement 3, 4)

- **Secret handling:** `getVapidPublicKeyFromEnv` returns only the public key; the public endpoint `/api/v1/notifications/vapid-public-key` returns `{ publicKey }` only. Private key stays server-side in `resolvePrivateJwk`. Confirm no route or bundle exposes `VAPID_PRIVATE_KEY`.
- **Graceful degradation:** when `getPrivateJwk` returns null, `sendPushForNotifications` returns early; inbox inserts still happen. `push-test` returns a clear 503 when public key missing.
- **Endpoint lifecycle:** `savePushSubscription` dedups by endpoint, reassigns endpoint to the new user if `user_id` differs (prevents cross-user hijack, Requirement 4.5), updates keys on repeat. `deletePushSubscription` scopes delete by `(user_id, endpoint)` so logout only removes the current device (Requirement 4.4). 404/410 removal is in the send loop (Requirement 4.3).
- **Potential finding:** `cachedPrivateJwk` is module-level and never reset; if the Worker isolate is reused across differing envs this could be stale. Assess and note (isolates are per-deployment so low risk); fix only if it violates correctness.

### 4. Behavioral audits (Requirement 5, 6, 7)

- **Recipients (5):** `notification-events.ts` uses `excludeUserId` (actor exclusion) and `skipDealer` to prevent self-echoes; `notifyOperationalAdmins` gates admin_staff by permission; campaigns dedup via `eventKey`. Audit each event function against the required recipient table and record findings. Confirm the order-place and dealer-self-cancel paths pass `actorUserId`/`skipDealer` from their call sites (verify in the order service, not just the event module).
- **Login/replay (6):** `processAnnouncementPopups` only emits items with `popupEnabled === true`; poll baseline initialization records `last_poll` so old items are not replayed. Confirm no code path turns unread inbox items into overlays on login.
- **Click routing (7):** links are entity-specific and role-specific (`/orders/:id`, `/distributor/orders/:id`, `/admin/campaigns/:id`, etc.). SW `notificationclick` posts `NOTIFICATION_NAVIGATE` with the link. Confirm graceful fallback to the notification center when the target 404s (verify the target routes handle missing entities without dumping to Home; add a fallback only if missing).

### 5. Cloudflare config, SW caching, final audit (Requirement 9, 10)

- **SW cache versioning:** `public/sw.js` uses `CACHE = "backrest-static-v12"`, deletes non-current caches on `activate`, and calls `skipWaiting()` + `clients.claim()`. This satisfies non-stale replacement. Note the version-bump discipline required when the SW changes.
- **Cloudflare config doc:** VAPID keys must be set as secrets (not vars): `wrangler secret put VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (and `CRON_SECRET`) under `--env production`. `wrangler.toml` production `[env.production.vars]` currently contains `MOCK_OTP="1"` and `DEMO_LOGINS_ENABLED="1"` — flag as a production concern in the report (change deferred per prior user decision; do not modify here without confirmation).
- **Final audit + report:** run typecheck, build, permission/RBAC tests, notification tests, API tests; then the focused audit list; then the 5-section report with an honest verdict.

## Data Models

No schema changes. Existing tables used as-is:

- `notifications(id, recipient_user_id, category, type, title, body, link, read, is_reminder, metadata, created_at)` — durable inbox. `metadata` JSON carries `popupEnabled`, `eventKey`, `i18n`, `sendAt`, `active`.
- `push_subscriptions(id, user_id, endpoint, p256dh, auth, created_at, updated_at)` — one row per endpoint; endpoint is the natural dedup key.

## Error Handling

- **Push send failures** are swallowed per-subscription (send loop try/catch) so one dead endpoint cannot block others; 404/410 trigger deletion. Confirmed correct.
- **Missing VAPID** — early return in send; 503 with actionable message on `push-test`; inbox unaffected.
- **API status typing** — fixed via correctly typed `ContentfulStatusCode` rather than `as any`.
- **Client push/subscribe** wrapped in try/catch to tolerate denied/unsupported devices.

## Testing Strategy

- **Automated (local, CODE):** `npx tsc --noEmit`; `npm run build`; `npm run test:permissions`; `npm run test:notifications`; `npm run test:audit` and any API test script. Note the 3 pre-existing `test:permissions` assertions that fail due to the deferred RBAC decision (admin_staff has `reports:read`/reward-claim access) — these are expected and must be reported, not "fixed" by changing RBAC.
- **Behavioral audits (CODE):** trace-and-record for recipients, login/replay, click routing, subscription lifecycle.
- **Manual checklist (MANUAL):** Web Push across open/tab/background/closed states, real device, real VAPID secrets, deployed Worker, HTTPS. Delivered as a checklist; not claimed as proven unless executed.

## Requirements Coverage

- R1 -> TypeScript build fixes (component 1).
- R2 -> Web Push flow audit + manual checklist (component 2).
- R3 -> VAPID secret handling (component 3).
- R4 -> Subscription lifecycle (component 3).
- R5 -> Recipient audit (component 4).
- R6 -> Login/replay audit (component 4).
- R7 -> Click routing audit (component 4).
- R8 -> Test notification (components 2, 3).
- R9 -> Cloudflare config + SW caching (component 5).
- R10 -> Final audit + report (component 5).

## Non-Goals

- No notification UI redesign.
- No change to intended notification behavior.
- No RBAC role/permission changes (deferred per prior user decision).
- No removal of existing mock/demo data.
- No modification of `wrangler.toml` production `MOCK_OTP`/`DEMO_LOGINS_ENABLED` without explicit confirmation (flagged in report only).

## Correctness Properties

These invariants the system must uphold; they drive the audits and any regression tests.

### Property 1: Inbox durability
Every notification event creates exactly one persistent inbox row per intended recipient, independent of push success or failure.

**Validates: Requirements 2.1, 3.4, 8.4**

### Property 2: Push is additive, never authoritative
A push send failure (missing VAPID, dead endpoint, network error) never prevents or rolls back the inbox insert.

**Validates: Requirements 3.4, 8.2**

### Property 3: One subscription per endpoint
For any endpoint, `push_subscriptions` holds at most one row; re-subscribing updates keys rather than duplicating.

**Validates: Requirements 4.1, 4.2**

### Property 4: Subscription ownership integrity
A subscription endpoint is always attributed to exactly one user; re-submitting an existing endpoint under a different user reassigns it, never creating a shared or cross-user record.

**Validates: Requirements 4.5**

### Property 5: Scoped logout deletion
Deleting a subscription on logout removes only the `(user_id, endpoint)` pair for the current device and leaves all other devices intact.

**Validates: Requirements 4.4**

### Property 6: Dead-endpoint reaping
A 404 or 410 push response deletes that endpoint subscription.

**Validates: Requirements 4.3**

### Property 7: No actor self-echo
The user who triggers an event does not receive a notification for their own action where the requirement forbids it (order place, dealer self-cancel).

**Validates: Requirements 5.2, 5.3, 5.6**

### Property 8: RBAC-consistent admin fan-out
admin_staff receives an admin notification only when their role currently includes the gating permission; master_admin always does.

**Validates: Requirements 5.5, 5.7**

### Property 9: Campaign publish idempotency
Publishing the same campaign does not create duplicate `campaign_new` notifications for a recipient who already has one (dedup by `eventKey`).

**Validates: Requirements 5.1**

### Property 10: No login replay
Login, refresh, or reopening the PWA never converts existing unread inbox items into overlays; only `popupEnabled === true` items may surface as popups, and only when not already viewing the target.

**Validates: Requirements 6.1, 6.2, 6.3, 6.4**

### Property 11: Deterministic click target
Clicking a notification navigates to its specific entity URL for the user role, never unconditionally to Home; a missing target falls back to the notification center.

**Validates: Requirements 7.1, 7.2, 7.3, 7.4**

### Property 12: Type safety without suppression
The codebase compiles under `exactOptionalPropertyTypes` with zero `any`/`@ts-ignore`/`@ts-expect-error` introduced by this work.

**Validates: Requirements 1.1, 1.2, 1.3**
