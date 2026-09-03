# Requirements Document

## Introduction

The dealer portal already ships a notification system whose intended architecture is:

- In-app notifications persist to a durable inbox/history.
- New notification events fan out over Web Push to a service worker, which shows a normal OS/browser notification.
- Login must never convert old unread inbox items into fullscreen popups. Only explicitly configured admin announcement popups may use the fullscreen overlay.

This spec does NOT redesign the notification UI or change intended behavior. It makes the existing system verifiably production-ready: fix the build, audit the end-to-end Web Push flow, confirm recipients and login behavior, verify click routing and the test-notification path, and document the exact Cloudflare configuration required.

Some items can be fully verified from code and automated tests in this environment. Others require live VAPID secrets, a deployed Cloudflare Worker, and a real device/browser, which are NOT available here. Each requirement is tagged CODE (fully verifiable locally) or MANUAL (code path verifiable, but end-to-end proof needs live config/device and will be delivered as a documented checklist). The final report will not claim MANUAL items are proven in production unless actually executed against live config.

## Glossary

- **Inbox**: Persistent notification history stored in the `notifications` table, read via `/api/v1/notifications`.
- **Web Push**: Browser push delivered to a `PushSubscription` and shown by the service worker (`public/sw.js`).
- **VAPID**: Voluntary Application Server Identification keys (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) used to sign push requests.
- **Announcement popup**: A notification with metadata `popupEnabled === true` that is allowed to use the fullscreen overlay.
- **Actor**: The user who performed the action that triggered a notification event.
- **CODE**: Requirement fully verifiable by reading code and running local build/tests.
- **MANUAL**: Requirement whose code path is verifiable but whose end-to-end proof needs live config/device.

## Requirements

### Requirement 1: TypeScript and build pass cleanly (CODE)

**User Story:** As a developer, I want the project to compile and build with no TypeScript errors and no suppressions, so that the notification changes ship on a green build.

#### Acceptance Criteria

1. WHEN `npx tsc --noEmit` is run THEN the system SHALL report zero errors.
2. WHEN `npm run build` is run THEN the system SHALL complete successfully.
3. WHERE a type error is fixed the system SHALL NOT use `any`, `@ts-ignore`, `@ts-expect-error`, or disabled compiler checks to do so.
4. WHEN Hono `c.json(...)` status-code type errors occur THEN the system SHALL resolve them with correctly typed status codes.
5. WHEN index-signature access errors (TS4111) occur THEN the system SHALL use bracket access such as `row['id']`.
6. WHEN `exactOptionalPropertyTypes` errors (TS2379, TS2345, TS2322) occur THEN the system SHALL resolve them by normalizing `undefined` to `null` or conditionally omitting the property, preserving existing runtime behavior.
7. WHERE type errors exist in reworked pricing code (`distributorPrice`, `pricingTierId`, `pricingContext`, `PricingContext`) the system SHALL fix them without altering pricing behavior.

### Requirement 2: Web Push end-to-end flow is correct (MANUAL)

**User Story:** As a portal user, I want to receive OS/browser notifications for new events, so that I am informed even when the app is not focused.

#### Acceptance Criteria

1. WHEN a user enables notifications THEN the browser SHALL create a PushSubscription and the backend SHALL persist it against that user.
2. WHEN a notification event occurs THEN the backend SHALL identify recipients and send a push to each of their subscriptions.
3. WHEN the service worker receives a push THEN it SHALL display an OS/browser notification unless the app is focused and the push is not forced.
4. WHEN a notification is clicked THEN the PWA SHALL open or focus and navigate to the correct order, campaign, complaint, reward, or announcement target.
5. WHEN the PWA is open, in another tab, minimized/backgrounded, or fully closed THEN the flow SHALL behave correctly for each state, documented in the manual checklist.
6. THE system SHALL NOT rely on polling or frontend timers as a replacement for Web Push, though existing polling MAY remain only for unread-count refresh and announcement popups.

### Requirement 3: VAPID configuration is correct and safe (CODE)

**User Story:** As an operator, I want VAPID keys read from Worker secrets and never leaked, so that push is secure.

#### Acceptance Criteria

1. WHEN the Worker runs THEN it SHALL read `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` from environment/secrets.
2. WHERE the browser needs the public key THE system SHALL expose ONLY the public key via the public endpoint.
3. THE system SHALL NEVER expose `VAPID_PRIVATE_KEY` to the frontend.
4. WHEN keys are missing THEN push SHALL fail gracefully AND in-app notifications SHALL continue working.
5. WHEN keys are missing AND a test notification is requested THEN the system SHALL return a clear configuration error.

### Requirement 4: Subscription reliability (CODE)

**User Story:** As a user with multiple devices, I want subscriptions managed correctly, so that pushes reach my devices and dead endpoints are cleaned up.

#### Acceptance Criteria

1. WHEN the same user subscribes from multiple devices THEN the system SHALL keep one row per endpoint for that user.
2. WHEN the same endpoint is submitted again THEN the system SHALL update, not duplicate, the row.
3. WHEN a push returns 404 or 410 THEN the system SHALL delete that subscription.
4. WHEN a user logs out from one device THEN the system SHALL delete only that device subscription and not other devices.
5. WHEN an endpoint already belongs to a different user THEN the system SHALL reassign or replace it so a subscription cannot be registered against another user account.

### Requirement 5: Notification recipient audit (CODE)

**User Story:** As a stakeholder, I want the right roles to get the right notifications with no redundant self-echoes, so that notifications are trustworthy.

#### Acceptance Criteria

1. THE system SHALL notify the correct role-based recipients for order placed, approved, rejected, cancelled, in making, out for delivery, delivered, campaigns, offers, rewards, complaints, signup approval, assignments, and user lifecycle events.
2. WHEN a dealer places an order THEN that dealer SHALL NOT receive a redundant "order placed" notification.
3. WHEN a dealer cancels their own order THEN that dealer SHALL NOT receive a redundant "order cancelled" echo.
4. WHEN a dealer places an order THEN the distributor SHALL receive a new-order notification.
5. WHEN an admin action occurs THEN Master Admin and, per existing RBAC only, Admin Staff SHALL receive notifications defined by existing business rules.
6. WHEN a user performs an action THEN that acting user SHALL NOT receive an unnecessary duplicate echo of their own action.
7. THE audit SHALL NOT change existing RBAC role/permission assignments, which are deferred per prior user decision.

### Requirement 6: Login and replay behavior (CODE)

**User Story:** As a returning user, I want login and refresh to be quiet, so that old notifications are not replayed as popups.

#### Acceptance Criteria

1. WHEN a user logs in THEN old unread notifications SHALL NOT be converted into popups.
2. WHEN a user refreshes the page or reopens the PWA THEN old notifications SHALL NOT be replayed.
3. THE unread notifications SHALL remain visible in the inbox.
4. WHERE a notification is an explicitly configured admin announcement popup with metadata `popupEnabled === true` THE system MAY show the fullscreen overlay.
5. THE campaign/product Home popups SHALL remain a separate mechanism from the notification overlay.

### Requirement 7: Notification click routing (CODE)

**User Story:** As a user, I want clicking a notification to open the exact related item, so that I am not dumped on Home.

#### Acceptance Criteria

1. WHEN an order notification is clicked THEN the system SHALL open the correct order for the user role.
2. WHEN a campaign, complaint, reward, or announcement notification is clicked THEN the system SHALL open the correct corresponding target.
3. THE system SHALL NOT always redirect to Home.
4. WHEN the target no longer exists THEN the system SHALL fall back gracefully to the notification center.

### Requirement 8: Test notification (CODE and MANUAL)

**User Story:** As an admin, I want a reliable "send test notification", so that I can confirm push works.

#### Acceptance Criteria

1. WHEN permission is not granted or no subscription exists THEN the test SHALL return a clear error and SHALL NOT proceed.
2. WHEN VAPID is missing THEN the test SHALL return a clear configuration error.
3. WHEN a test is sent THEN it SHALL deliver a real Web Push, verified in the manual checklist for backgrounded and closed states.
4. WHEN a test is sent THEN it SHALL NOT create unwanted duplicate inbox records.
5. THE test SHALL NOT repeatedly request browser permission.

### Requirement 9: Production Cloudflare configuration and service-worker caching (CODE and MANUAL)

**User Story:** As an operator, I want the notification system to work on Cloudflare Workers, D1, and production HTTPS with a correctly scoped, non-stale service worker.

#### Acceptance Criteria

1. THE implementation SHALL be compatible with Cloudflare Workers and D1, verified in code.
2. THE service worker scope and cache-versioning SHALL ensure an updated service worker replaces an old cached one, with activate cleaning old caches and `skipWaiting`/`clients.claim` present.
3. THE required production secrets and config SHALL be documented exactly.
4. WHEN deployed to production HTTPS with real VAPID secrets THEN the full flow SHALL work, verified in the manual checklist.

### Requirement 10: Final production audit and report (CODE and MANUAL)

**User Story:** As a stakeholder, I want a final audit and a concise report, so that I know exactly what is verified and what remains.

#### Acceptance Criteria

1. THE audit SHALL run TypeScript check, production build, RBAC/permission tests, notification tests, and API tests.
2. THE audit SHALL focus on duplicate notifications, race conditions, incorrect recipients, security issues, auth/session issues, invalid push subscriptions, service-worker caching, failed push handling, missing error handling, and database consistency.
3. THE work SHALL NOT remove existing mock/demo data elsewhere in the project.
4. THE final report SHALL contain what was verified, what was fixed, remaining issues, exact Cloudflare secrets/config still required, and a production-readiness verdict.
5. THE report SHALL NOT claim Web Push is production-ready unless the end-to-end flow and production configuration have actually been verified against live config.
