# Implementation Plan

## Overview

This plan makes the existing notification system verifiably production-ready. Task 1 unblocks the build (it gates everything). Tasks 2 through 8 are targeted audits with fix-only-if-defect scope, since the architecture is already correct. Task 9 documents the exact Cloudflare config and delivers the MANUAL Web Push checklist. Task 10 runs the full automated audit and writes the honest final report.

## Task Dependency Graph

```
1 (1.1, 1.2, 1.3, 1.4 -> 1.5)
  |
  +-- 2  (VAPID audit)
  +-- 3  (subscription reliability)
  +-- 4  (4.1 -> 4.2 recipients)
  +-- 5  (login/replay)
  +-- 6  (click routing)
  +-- 7  (test notification)
  +-- 8  (SW caching / CF compat)
        |
        9 (CF config doc + MANUAL checklist)  [depends on 2, 8]
        |
        10 (final automated audit + report)   [depends on 1-9]
```

- Tasks 2-8 depend on Task 1 (green build) but are independent of each other and may run in parallel.
- Task 9 depends on Tasks 2 and 8.
- Task 10 depends on all prior tasks.


```json
{
  "waves": [
    { "wave": 1, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "wave": 2, "tasks": ["1.5"] },
    { "wave": 3, "tasks": ["2", "3", "4.1", "5", "6", "7", "8"] },
    { "wave": 4, "tasks": ["4.2"] },
    { "wave": 5, "tasks": ["9"] },
    { "wave": 6, "tasks": ["10"] }
  ],
  "dependencies": {
    "1.5": ["1.1", "1.2", "1.3", "1.4"],
    "2": ["1.5"],
    "3": ["1.5"],
    "4.1": ["1.5"],
    "4.2": ["4.1"],
    "5": ["1.5"],
    "6": ["1.5"],
    "7": ["1.5"],
    "8": ["1.5"],
    "9": ["2", "8"],
    "10": ["1.5", "2", "3", "4.2", "5", "6", "7", "8", "9"]
  }
}
```

## Tasks

- [x] 1. Fix TypeScript build errors in `api/app.ts` (no suppressions)
- [x] 1.1 Fix Hono status-code typing (TS2769)
  - Locate the `AppError` class definition and type its `statusCode` as `ContentfulStatusCode` (import from `hono/utils/http-status`), so `app.onError`'s `c.json(body, err.statusCode)` at ~line 242 type-checks.
  - If the source-type change is not viable, narrow at the call site with a typed value (no `any`).
  - _Requirements: 1.1, 1.3, 1.4_

- [x] 1.2 Fix index-signature access errors (TS4111)
  - Convert dotted access to bracket access on D1 `Record<string, unknown>` rows at lines 383, 511, 517, 518, 521, 522, 525, 530, 531, 532, 577, 583, 584 (e.g. `layer['id']`, `item['product_id']`, `row['thickness']`).
  - No runtime behavior change.
  - _Requirements: 1.1, 1.3, 1.5_

- [x] 1.3 Fix missing `category`/`id` on pricing return type (TS2339)
  - Give `mapCatalogProductWithPricing` an explicit return type (or type the spread source) so `id: string` and `category: string` are present, fixing lines 513, 514, 544, 545 and downstream `.filter(p => p.category === ...)` / `String(p.id)`.
  - Do not change computed pricing values.
  - _Requirements: 1.1, 1.3, 1.7_

- [x] 1.4 Fix exactOptionalPropertyTypes errors (TS2379/TS2345/TS2322)
  - Normalize `user.dealerId` / `user.distributorId` (`string | undefined`) to `null` or use conditional spreads where the target is optional; guard where a non-optional `string` is required (lines 395, 440, 567, 602, 660, 680, 681, 689, 692, 703, 704, 717, 750, 763, 774, 775, 783, 785, 798, 800, 811, 812, 848).
  - Coalesce `default_thickness` to `null` for `applyMattressPricing` at line 395.
  - Preserve existing runtime behavior; no pricing math change.
  - _Requirements: 1.1, 1.3, 1.6, 1.7_

- [x] 1.5 Verify clean typecheck and build
  - Run `npx tsc --noEmit` and confirm zero errors; run `npm run build` and confirm success.
  - Confirm no `any`/`@ts-ignore`/`@ts-expect-error` were introduced (grep the diff).
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Audit VAPID configuration and secret safety
  - Confirm `getVapidPublicKeyFromEnv` and `/api/v1/notifications/vapid-public-key` expose only the public key; confirm `VAPID_PRIVATE_KEY` is never returned by any route or reachable in the client bundle (grep client build/source).
  - Confirm `resolvePrivateJwk` reads `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` server-side; confirm graceful early-return when keys are missing and that inbox inserts still occur.
  - Confirm `push-test` returns a clear 503 when the public key is missing.
  - Assess module-level `cachedPrivateJwk` (never reset) for staleness risk; document; fix only if it breaks correctness.
  - Record findings.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Audit push subscription reliability and lifecycle
  - Confirm `savePushSubscription` dedups by endpoint, updates keys on repeat (Property 3), and reassigns endpoint when `user_id` differs (Property 4).
  - Confirm `deletePushSubscription` scopes delete by `(user_id, endpoint)` so logout affects only the current device (Property 5).
  - Confirm 404/410 responses delete the subscription in `sendPushForNotifications` (Property 6).
  - Record findings; fix any confirmed defect without changing behavior elsewhere.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 4. Audit notification recipients across all events
- [x] 4.1 Build the recipient matrix and verify against events
  - For each event (order placed/approved/rejected/cancelled/in_making/out_for_delivery/delivered, campaigns, offers, rewards, complaints, signup approval, assignments, user lifecycle), record intended recipients vs `notification-events.ts` implementation.
  - Confirm distributor receives new dealer orders; confirm admin fan-out is RBAC-gated (`notifyOperationalAdmins`).
  - _Requirements: 5.1, 5.4, 5.5_

- [x] 4.2 Verify no actor self-echo at call sites
  - Trace order-place and dealer-self-cancel call sites (order service) to confirm `actorUserId`/`skipDealer` are passed so the dealer does not get a redundant "order placed"/"order cancelled" echo (Property 7).
  - Confirm campaign publish dedup via `eventKey` (Property 9).
  - Do NOT change RBAC assignments (Requirement 5.7); report the 3 expected `test:permissions` failures as deferred.
  - Record findings; fix only confirmed defects.
  - _Requirements: 5.2, 5.3, 5.6, 5.7_

- [x] 5. Audit login/replay behavior
  - Confirm `use-notification-bridge.ts` never converts unread inbox items into overlays on login/refresh/reopen; only `popupEnabled === true` items surface (Property 10), and only when not viewing the target.
  - Confirm poll baseline initialization prevents replay of pre-existing items; confirm campaign/product Home popups are a separate mechanism.
  - Record findings; fix only confirmed defects.
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 6. Audit notification click routing
  - Verify each notification `link` targets the correct role-specific entity route (orders/campaigns/complaints/rewards/announcements) and that SW `notificationclick` + `NOTIFICATION_NAVIGATE` navigate there, never unconditionally to Home (Property 11).
  - Verify target routes handle a missing entity gracefully (fall back to notification center); add a fallback only if one is missing.
  - Record findings; fix only confirmed defects.
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 7. Verify the test-notification path
  - Confirm `push-test` requires an existing subscription (clear error otherwise) and returns 503 on missing VAPID; confirm the client does not repeatedly request permission.
  - Confirm a test creates at most one inbox record (no unwanted duplicates, Property 1) and that `force: true` shows it even when focused.
  - Record findings; fix only confirmed defects.
  - _Requirements: 8.1, 8.2, 8.4, 8.5_

- [x] 8. Verify service-worker caching and Cloudflare compatibility
  - Confirm `public/sw.js` `activate` deletes non-current caches and calls `skipWaiting()`/`clients.claim()` so an updated SW replaces a stale one; document the cache-version bump discipline.
  - Confirm the Worker/D1 usage is compatible (no Node-only APIs in the push path beyond `nodejs_compat`).
  - _Requirements: 9.1, 9.2_

- [x] 9. Document exact Cloudflare production configuration and deliver MANUAL checklist
  - Write the exact secret commands: `wrangler secret put VAPID_PUBLIC_KEY|VAPID_PRIVATE_KEY|VAPID_SUBJECT` (and `CRON_SECRET`) under `--env production`.
  - Flag (do not change) `[env.production.vars]` `MOCK_OTP="1"` and `DEMO_LOGINS_ENABLED="1"` as production concerns per prior user decision.
  - Deliver the MANUAL Web Push verification checklist (PWA open / other tab / backgrounded / closed; real device; deployed Worker; HTTPS).
  - _Requirements: 9.3, 9.4, 2.5, 8.3_

- [ ] 10. Run full automated audit and write the final report
  - Run `npx tsc --noEmit`, `npm run build`, `npm run test:permissions`, `npm run test:notifications`, `npm run test:audit`, and any API test script; capture results (note the 3 expected RBAC failures as deferred).
  - Perform the focused audit: duplicate notifications, race conditions, incorrect recipients, security, auth/session, invalid push subscriptions, SW caching, failed push handling, missing error handling, DB consistency.
  - Do NOT remove existing mock/demo data.
  - Write the 5-section report: (1) verified, (2) fixed, (3) remaining, (4) exact Cloudflare secrets/config still required, (5) production-readiness verdict — NOT claiming Web Push is production-ready unless the end-to-end flow and prod config were actually verified against live config.
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

## Notes

- Tasks 2-8 are audit-first: the deliverable is a recorded finding plus a fix only when a defect is confirmed. The architecture is already correct, so most tasks should confirm rather than change behavior.
- No RBAC role/permission changes (deferred per prior user decision). The 3 failing `test:permissions` assertions are expected and reported, not "fixed".
- No notification UI redesign, no intended-behavior change, no removal of mock/demo data.
- `wrangler.toml` production `MOCK_OTP`/`DEMO_LOGINS_ENABLED` are flagged in the report only; do not change without explicit confirmation.
- Requirements 2, 8.3, 9.4 have MANUAL components that cannot be fully proven without live VAPID secrets, a deployed Worker, and a real device; these are delivered as a checklist and not claimed as production-proven.

