# Deployment & Manual Web Push Verification

Task 9 deliverable for the `notification-system-production-ready` spec.

Covers Requirements 9.3 (document exact production secrets/config), 9.4 and 2.5
(full flow / app-state behavior verified against live config), and 8.3 (test
notification delivery verified for backgrounded/closed states).

> **Scope note:** This is a documentation artifact only. It does not change
> `wrangler.toml`, application code, or RBAC. The MANUAL sections below cannot be
> proven in the build/CI environment — they require live VAPID secrets, a deployed
> Cloudflare Worker on a real HTTPS domain, and a real device.

---

## 1. Required Cloudflare production secrets (exact commands)

VAPID keys and the internal cron secret MUST be set as **Worker secrets**, never as
plaintext `vars`. Secrets are encrypted at rest and never appear in the client
bundle or in `wrangler.toml`. Set each one against the `production` environment:

```bash
npx wrangler secret put VAPID_PUBLIC_KEY --env production
npx wrangler secret put VAPID_PRIVATE_KEY --env production
npx wrangler secret put VAPID_SUBJECT --env production
npx wrangler secret put CRON_SECRET --env production
```

| Secret | Purpose | Value format |
| --- | --- | --- |
| `VAPID_PUBLIC_KEY` | Public application server key. Signed into push requests and served to the browser so it can create a `PushSubscription`. | base64url string (uncompressed EC P-256 point, 65 bytes starting `0x04`) — or the public member of a JWK pair (see below). |
| `VAPID_PRIVATE_KEY` | Private application server key used to sign push requests. **Server-only, never exposed to the client.** | base64url string (the JWK `d` value) — or a full JWK **JSON string**. |
| `VAPID_SUBJECT` | Contact identifier included in the push request per the VAPID spec. | `mailto:support@backrest.in` or an `https://` URL. Falls back to `mailto:support@backrest.in` in code if unset. |
| `CRON_SECRET` | Shared secret for internal/cron endpoints. | Any high-entropy string. |

### CRON_SECRET is required by the internal endpoints

`requireInternalSecret` in `api/app.ts` reads `c.env.CRON_SECRET`. If it is unset
the internal endpoints return **503 "Internal endpoints not configured"**; if the
caller's `x-cron-secret` header does not match, they return **401 "Unauthorized"**.
It guards:

- `POST /api/v1/internal/cron/reminders`
- `POST /api/v1/internal/whatsapp/process`

The Worker's scheduled trigger is configured in `wrangler.toml`
(`crons = ["*/15 * * * *"]`). Set `CRON_SECRET` so these endpoints are callable and
protected.

### How to generate VAPID keys

`resolvePrivateJwk` in `api/services/push-notifications.ts` accepts **either** form:

1. **A full JWK JSON string** — if `VAPID_PRIVATE_KEY` begins with `{`, it is parsed
   as a `JsonWebKey` directly (e.g. output from the PushForge CLI).
2. **A base64url public/private pair** — otherwise the public key is decoded as an
   uncompressed EC P-256 point (65 bytes, first byte `0x04`) and combined with the
   private `d` value to build the JWK. This is the shape produced by the standard
   `web-push` CLI.

**Recommended:** generate with the `web-push` CLI, which yields a base64url
public/private pair matching code path (2):

```bash
npx web-push generate-vapid-keys
```

Use the printed `Public Key` as `VAPID_PUBLIC_KEY` and `Private Key` as
`VAPID_PRIVATE_KEY`. The same public key is also fetched by the browser at runtime
via `GET /api/v1/notifications/vapid-public-key`, which returns only the public key
(the private key is never returned by any route).

---

## 2. `wrangler.toml` production concerns (flag only — DO NOT change)

The source `wrangler.toml` `[env.production.vars]` block contains only
`ENVIRONMENT = "production"` and `ALLOWED_ORIGINS = ""`. However, the demo/mock
flags **are injected into the deployed config at build time**:
`scripts/patch-wrangler-output.mjs` (run automatically after `vite build`) writes
`MOCK_OTP = "1"` and `DEMO_LOGINS_ENABLED = "1"` into both the top-level and
`env.production` vars of `.output/server/wrangler.json` — which is exactly the file
`npm run deploy` ships (`wrangler deploy --config .output/server/wrangler.json --env production`).

So in the **deployed production Worker** these are effectively live:

| Var | Effect in production | Concern |
| --- | --- | --- |
| `MOCK_OTP = "1"` | OTP verification is bypassed/mocked (fixed code `123456` via `isDemoModeEnabled`). | Anyone can authenticate without a real OTP. **Security concern.** |
| `DEMO_LOGINS_ENABLED = "1"` | One-tap demo login shortcuts are exposed. | Demo accounts are reachable in production. **Security concern.** |

Per prior user decision these are **DEFERRED** and must be changed by the user before
a real production launch. Recommended production values:

- `MOCK_OTP = "0"`
- `DEMO_LOGINS_ENABLED = "0"`

Because these are injected by `scripts/patch-wrangler-output.mjs`, changing them for
production means editing that script (or removing the injection) in addition to any
`wrangler.toml` edit — otherwise the build will re-add them. **This file does not make
that change.**

Note (correct as-is): the VAPID and `CRON_SECRET` values are **not** in
`wrangler.toml` vars, which is the intended, safe setup — they must be provided as
Worker secrets (Section 1).

---

## 3. Service worker cache versioning

- `public/sw.js` defines `const CACHE = "backrest-static-v12";` — bumped to `v12`
  this session.
- **Rule:** bump this version string on every change to `sw.js` or the app shell so
  the old cache is purged. On `activate`, the SW deletes every cache whose key is not
  the current `CACHE`, then calls `self.clients.claim()`. On `install` it calls
  `self.skipWaiting()`. Together these guarantee an updated SW replaces the stale one
  without a manual cache clear.
- The SW is registered as `/sw.js` at **root scope** with `updateViaCache: "none"`,
  so the browser byte-diffs `sw.js` on every load and installs a new version whenever
  the file changes — which is why the `CACHE` bump discipline matters.

---

## 4. MANUAL Web Push end-to-end verification checklist

**These steps CANNOT be proven in this environment.** A human must run them against
the **deployed production Worker**, on a **real HTTPS domain**, using a **real
device/browser** with the **PWA installed**.

### Precondition
- [ ] VAPID secrets (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) and
      `CRON_SECRET` set for `--env production` (Section 1).
- [ ] Worker deployed (`npm run deploy`) and reachable over HTTPS.
- [ ] Database migrations applied to remote (`npm run db:migrate:remote`).
- [ ] PWA installed on the test device.

### 4.1 Enable notifications & confirm subscription persists
- [ ] Grant notification permission in the app.
- [ ] Confirm the browser creates a `PushSubscription`.
- [ ] Confirm the backend persists it: trigger a later push (Section 4.4) and confirm
      it arrives — proving the subscription row was saved against the user.

### 4.2 Trigger each notification type — verify OS notification + click routing
For each event, confirm an OS/browser notification appears **and** clicking it opens
or focuses the PWA on the correct target (never dumped on Home):
- [ ] New order — place as a dealer → verify the **distributor** device receives it and
      it routes to the order.
- [ ] Order approved
- [ ] Order rejected
- [ ] Order in making
- [ ] Order out for delivery
- [ ] Order delivered
- [ ] Campaign published → routes to the campaign.
- [ ] Reward claim → routes to the reward.
- [ ] Complaint new → routes to the complaint.
- [ ] Complaint updated → routes to the complaint.

### 4.3 App-state matrix
For a representative notification, verify the OS notification arrives and the click
opens the correct page when the PWA is:
- [ ] (a) open and focused
- [ ] (b) open in another tab
- [ ] (c) minimized / backgrounded
- [ ] (d) fully closed

### 4.4 "Send test notification" (admin)
- [ ] With VAPID **unset** → the endpoint returns **503** with the message
      "Web Push is not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY."
- [ ] With VAPID set but **no device subscription** → returns **400**
      "Enable push notifications on this device first."
- [ ] With VAPID set and a subscription present → success shows a **real push** on
      the device.
- [ ] Confirm the test creates **exactly one** inbox row (no duplicates).
- [ ] Confirm the browser does **not** re-prompt for permission on repeated tests.

### 4.5 Self-echo check
- [ ] A dealer user places an order → confirm the **placing** user does **NOT** get an
      "order placed" push or inbox item.
- [ ] Confirm a **second dealer user of the same org DOES** receive it.
- [ ] Confirm the **distributor DOES** receive it.

### 4.6 Dead-subscription reaping
- [ ] Unsubscribe or expire a device, then trigger a push → confirm the endpoint's
      404/410 response causes the subscription row to be deleted.

### 4.7 Multi-device
- [ ] Subscribe two devices for the same user → confirm **both** receive the push.

---

## 5. Deploy command reference

From `package.json`:

```bash
# Build the app, patch the Nitro wrangler.json (Section 2), and deploy to production
npm run deploy
# = npm run build && wrangler deploy --config .output/server/wrangler.json --env production

# Apply database migrations to the remote (production) D1 database
npm run db:migrate:remote
# = wrangler d1 migrations apply backrest-db --remote --config wrangler.toml
```

Set the secrets in Section 1 **before** the first production deploy so Web Push and
the internal cron endpoints function on launch.
