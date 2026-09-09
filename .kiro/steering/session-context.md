---
inclusion: always
---

# Session Context — cross-laptop handoff

This file is auto-written on "sync" so Kiro on the other laptop can resume instantly.
Last updated: 2026-09-06 (session 8 — FIX: admin-created mattresses invisible to dealers; DEPLOYED).

## SESSION 8 (this laptop) — committed (24d9164), pushed, DEPLOYED (Version fbc1d37f, SW v43)
BUG REPORT: user deleted all seed products, created new mattresses from admin — they were INVISIBLE to
dealers/distributors (but fine in admin). NOT a sqft-pricing bug — sqft rates were correct.

ROOT CAUSE: the dealer/distributor catalog renders mattresses GROUPED BY catalogue layer
(`mattressLayers`, built from `product_layer_items`). But products-admin.ts create/update NEVER wrote
`product_layer_items` (and the client toApiInput never even sent `layerGroup`). Layer assignments only
ever came from the SEED. So any hand-created mattress had 0 layer rows -> absent from mattressLayers ->
invisible to dealers, even though active + priced + returned in the flat `products` array.

FIX (api/services/products-admin.ts):
- New syncProductLayer(db, productId, group): maps a guarantee string (e.g. "5 Years") to a
  product_layers row by matching the YEAR NUMBER in the layer title (layer-1 "3 & 5 Years", layer-2
  "7 Years", layer-3 "10 Years", layer-4 "12 Years"). Replaces the product's product_layer_items row.
  subgroup_label = the guarantee ONLY for multi-guarantee layers (title has >1 number, e.g. layer-1);
  NULL otherwise (so it doesn't flip a flat layer into subgroup-mode and hide siblings).
- Called in createAdminProduct + updateAdminProduct for mattresses (isMattressCategory), using
  input.layerGroup ?? input.guarantee (?? before.guarantee on update).
- ProductInput += layerGroup?. Client src/services/admin/products.ts toApiInput now sends layerGroup.
- LIMITATION: guarantee number must exist in a layer title (3/5/7/10/12). A guarantee with no matching
  layer won't be placed (no layer exists for it). Extend layers/mapping if new guarantee values used.

BACKFILL (already done on REMOTE prod D1): the user's 3 products got product_layer_items rows —
Ortho Bond -> layer-1 subgroup "3 Years"; Ortho Max + Ortho Plush -> layer-1 subgroup "5 Years".
They are LIVE/visible now (catalog reads layer rows at runtime; refresh dealer app for SW v43).

## NOTE: "prod" URL is actually STAGING (demo mode ON). Deploys here are to that env.

## IMPORTANT: backrest-pwa.shahharsh143-hs.workers.dev is STAGING, not production.
Demo mode there (MOCK_OTP=1, DEMO_LOGINS_ENABLED=1, OTP 123456, demo buttons) is appropriate. Still a real D1 DB (reset once) — migrations ADD-only.

## SESSION 7 (this laptop) — committed AND DEPLOYED to staging

### E. Removed the LEGACY guarantee-keyed sqft-rate system — DEPLOYED (Version 77100f44, SW v37)
- It was redundant: legacy `mattress_sqft_rates` (migration 0018) is guarantee+thickness keyed, only bakes product_prices.mrp via a "Recalculate" button, and is NOT read at runtime. Mattress pricing is now per-product via product_sqft_rates (0035) read live by buildPriceQuote — and mattresses no longer use product_prices.mrp at runtime, so the legacy "Recalculate" did nothing for mattresses (confusing).
- REMOVED (option A, full): 2 nav links (src/routes/admin/pricing/tiers.tsx + src/routes/admin/products/index.tsx "Sq ft rates" buttons); 5 backend endpoints in api/app.ts (GET/PUT/DELETE /pricing/sqft-rates, POST /recalculate, GET /options — replaced by an explanatory comment); DELETED api/services/mattress-sqft-rates.ts, src/routes/admin/pricing/sqft-rates.tsx, src/services/admin/sqft-rates.ts. routeTree.gen.ts regenerated (route dropped). Verified live: /api/v1/admin/pricing/sqft-rates -> 404.
- KEPT: the mattress_sqft_rates TABLE + migration 0018 (dropping a table is a D1 rebuild risk; harmless to leave unused). sqlite-d1.ts still references 0018 for migration tracking — fine.

### D. Login STILL logged out (real root cause) + admin reports Reset + searchable dropdowns — DEPLOYED (Version f1e77e13, SW v36)
- LOGIN root cause (C's fix wasn't enough / never reached device): (1) SW cache was NOT bumped on C's deploy, so the PWA served the STALE cached JS bundle (public/sw.js is cache-first for .js/static) — the device never ran the auth.ts fix. (2) Login route src/routes/index.tsx has start_url "/" (where the PWA reopens) and its beforeLoad only redirected if `await getCurrentUser()` was truthy — a cold-start cookie blip returned null and STRANDED the user on the login page = "logged out". FIX: beforeLoad now redirects on peekCachedUser() SYNCHRONOUSLY (memory/localStorage, no /auth/me wait) before falling back to getCurrentUser(); bumped SW cache v35 -> v36 so the fix (and C's auth.ts retry fix) actually ship. IMPORTANT for testing: user must reopen the PWA ONCE to activate SW v36 before the fix applies. If it STILL logs out after v36 loads -> cookie genuinely not stored (iOS ITP / block-cross-site-cookies) -> would need a token-in-storage fallback (NOT done).
- ADMIN REPORTS RESET (src/routes/admin/reports/index.tsx): onReset was `apply({...all undefined})` which spread old search + undefined and left stale filter params. FIX: navigate to a FRESH search {view, from, to} only. MultiSelects derive selected from filters.* so they clear when URL search clears.
- SEARCHABLE DROPDOWNS: NEW src/components/ui/searchable-select.tsx (single-select combobox: Popover + Command + CommandInput, drop-in for <Select>). Applied to distributor reports (src/routes/distributor/reports.tsx dealer filter) + distributor dealer-visits (src/routes/distributor/dealer-visits/index.tsx sales-exec + dealer filters; status kept as plain Select). Admin reports already searchable (MultiSelect has CommandInput).

### C. PWA logout-on-reopen fix (client-only) — DEPLOYED (Version ed3a3754)
- Symptom: installed PWA logs the user out after close / remove-from-background + reopen.
- Root cause (NOT a real server expiry): the 30-day session cookie (Max-Age 2592000, SameSite=Lax, HttpOnly, Secure) + 30-day DB session are fine. On PWA cold launch, use-session (mount/pageshow/visibilitychange) fires /api/v1/auth/me BEFORE the cookie is attached -> 401; the OLD fetchCurrentUser retried once (400ms) then returned null, and getCurrentUser did writeStoredUser(null) — the client WIPED its own valid session and requireUser bounced to "/". Server never logged them out.
- FIX in src/services/auth.ts (client-only, no migration):
  - fetchCurrentUser now returns {user, confirmedLoggedOut} and retries auth failures 4x with backoff [300,600,900]ms (~1.8s cushion for the cookie to attach).
  - getCurrentUser NO LONGER persists null on a transient/unconfirmed 401 — it KEEPS the stored user (localStorage untouched) and self-corrects on the next revalidation. Only writeStoredUser(null) when confirmedLoggedOut.
  - confirmedLoggedOut is true only when (no stored user) OR (everConfirmedSession — a module flag set true after the first successful /auth/me this runtime, so a later persistent 401 = real revoke/suspend, not a cold-launch blip). Explicit logout() still clears via invalidateSessionCache.
  - Net: cold-launch keeps you logged in; genuine visitor / real revocation still logs out.
- NOTE: SW cache NOT bumped this deploy, so testers must reopen once to get the new client bundle. Real cold-launch cookie timing only reproduces on a device — user to verify reopen behavior.

## SESSION 7 (this laptop) — committed AND DEPLOYED to staging (Version 8f588631)
Pulled the other laptop's session-6 commit (3a108c4: sqft pricing, pincode, admin_staff/sales_head demo logins) — clean fast-forward. Verified migrations 0033–0037 are ALL already applied on the staging REMOTE D1 (reward_claims.kind, user_role_overrides, product_sqft_rates, pincodes present). This session added NO new migrations (code-only).

### A. Demo login buttons now show on staging via a SERVER flag (not only the build flag)
- Root cause of "buttons missing": they render only when isDemoLoginsEnabledByBuild() (import.meta.env.DEV or VITE_DEMO_LOGINS) — a BUILD-time flag not set on the staging build. Nothing was removed; the pulled commit actually ADDED admin_staff + sales_head buttons (6 total).
- FIX: NEW public route `GET /api/v1/config/public` -> `{ demoLoginsEnabled: isDemoModeEnabled(effectiveEnv(c.env)) }` (unauthenticated, only that boolean). `src/lib/demo-logins-enabled.ts` added `fetchDemoLoginsEnabledFromServer()`. `src/routes/index.tsx` Login: showDemoLogins is state, seeded from build flag then set true if the server reports demo mode on. All 6 role buttons now appear on staging.

### B. Mattress MRP: removed manual entry + added live sqft MRP preview (mattress-only, non-breaking)
- FIRST confirmed sqft pricing already works end-to-end (live tests on staging: twin/6" at 72x36=18sqft -> rate 500=>MRP 9000, 600=>10800, 550=>9900). MRP is computed LIVE at quote/order time by buildPriceQuote->getProductSqftRate = round(rate × snappedArea). Changing a rate needs NO redeploy. The editor's stored MRP field intentionally does NOT change (MRP is dynamic per size) — that was the user's confusion, not a bug.
- `src/routes/admin/products/new.tsx`: for mattresses the manual MRP <Input> is HIDDEN (info note instead); pillows/foldables keep it. Added "MRP (72\"×36\")" preview column in the per-sqft table = round(rate×18). Price-list margin table for mattresses previews against priceListMrp (cheapest thickness base-size MRP) instead of the now-0 manual mrp.
- `api/services/product-sqft-rates.ts`: added minSqftRateFor(db, productId).
- `api/services/pricing.ts` buildPriceQuote: mattress catalog "from" preview (no size/thickness) with sized.mrp<=0 now derives MRP = round(minSqftRate × 18) so cards don't show ₹0. Imported minSqftRateFor + BASE_MATTRESS_LENGTH/BREADTH.
- Backend product_prices.mrp = 0 for mattresses (unused at runtime); assertMattressSqftRates still enforces a rate per thickness before save. Non-mattress unchanged.
- NOTE: did NOT bump SW cache this deploy (other laptop's session-6 note says it bumped to v35, but that build wasn't deployed by them — wrangler wasn't authed there). Current deployed SW cache = whatever was in 8f588631's build (v35 from the pulled code). Returning clients update on next SW load.
- NOTE: the other laptop's session-6 said "wrangler NOT authenticated" there — so THEY did not deploy; THIS laptop deployed their + our combined work to staging.

## SESSION 6 (other laptop) — code pulled, NOT deployed by them (wrangler unauth). Now deployed via this laptop.
Last updated: 2026-09-05 (session 6 — mattress sqft pricing, demo logins, pincode location system).

## THIS SESSION (session 6) — NOT yet deployed. Migrations 0035/0036/0037 applied LOCAL only.
Prod deploy blocked: wrangler NOT authenticated on this laptop (`wrangler login` needed). SW cache bumped v34 -> v35.

### A. Mattress per-thickness ₹/sqft pricing (MRP-only; margins derive dealer/distributor)
- Migration 0035 `product_sqft_rates(product_id, thickness, mrp_per_sqft, PK(product_id,thickness))`.
- api/services/product-sqft-rates.ts: getProductSqftRate, listProductSqftRates, hasCompleteSqftRates,
  completeProductIds, saveProductSqftRates, isMattressCategory (mattress = category not Pillows/Foldable).
- api/services/mattress-pricing.ts: applySqftMrp(mrpPerSqft, dims) = round(mrpPerSqft * (snapL/12)*(snapW/12)),
  snapped via existing 1" buffer, NO floor.
- buildPriceQuote (pricing.ts): mattress+dims+thickness -> MRP from sqft rate; dealer=calculateDealerPrice(mrp,
  dealerMargin) ALWAYS (bypasses stored dealer); distributor/campaign/points unchanged. Throws
  "Mattress sq.ft price not set" if mattress lacks a rate for the chosen thickness.
- COMPULSORY: products-admin.ts assertMattressSqftRates blocks saving a mattress without a rate for EVERY
  thickness. Catalog list + detail (app.ts) HIDE mattresses missing complete rates (completeProductIds).
- Admin editor (routes/admin/products/new.tsx ProductEditor): mattress-only "Per-sq.ft MRP" table, one MRP
  input per thickness. Client type + toApiInput carry sqftRates[].
- Tested (22 asserts): 74x63->75x66=34.375sqft@500=17188; 70x37->72x36=18@500=9000; chain 9000-50%=4500 /1.1=4091.
- GOTCHA: existing prod mattresses will VANISH from dealer catalog until admin sets sqft rates for all thicknesses.

### B. Demo logins for admin_staff + sales_head
- shared/demo-phones.ts + src/lib/demo-users.ts: added adminStaff 9888877777 (existing user) + salesHead 9866655555.
- Migration 0036 seeds user-sales-head (base role admin_staff + user_role_overrides row -> sales_head).
- Login page (routes/index.tsx) now shows 6 demo buttons. i18n demoAdminStaff/demoSalesHead (en+hi). OTP 123456.

### C. Pincode location system (India Post master)
- Migration 0037: `pincodes(pincode,state,district,area, PK(pincode,area))` + idx; ADD nullable
  pincode/state/district/area to BOTH dealers + signup_applications.
- scripts/generate-pincodes-sql.mjs parses root `pincode master.csv` (22MB, ~165k rows) -> scripts/pincodes.generated.sql
  (8.3MB, GITIGNORED). Loaded LOCAL: 165,602 rows. officename->area, statename->state, district, pincode; title-cased.
- api/services/pincodes.ts: lookupPincode(db,code)->{state,district,areas[]}, resolveSubmittedLocation (server
  validation), displayLocation(parts) composer. PUBLIC GET /api/v1/pincode/:code (no auth, for signup).
- Signup (routes/signup.tsx): required 6-digit pincode -> auto readonly State/District + Area select (multi-area);
  client zod + server validate. Stored on signup_applications, then dealers at approval (signup-review.ts), with
  legacy `location` composed from parts for back-compat. dealers DTO returns the 4 fields.
- Display: src/lib/location.ts (displayLocation/resolveLocationDisplay mirror); server-composed dealers.location
  makes all {dealer.location} sites show structured value automatically; profile + dealer detail use structured directly.
- Reports (admin-executive-reports.ts): filters + grouping use real d.state/district/area/pincode
  (COALESCE(NULLIF(d.state,''), d.location) — normalized first, legacy territoryFromLocation fallback). Filter
  options return states/districts/areas. app.ts reads state/district/area/pincode query params.
- Admin-created dealers (users.ts createDealerStore) have NULL structured location (no pincode field added to admin
  form per scope) -> show as Unassigned/legacy in reports. Existing dealers: no backfill (Unassigned).
- DEPLOY needs: apply 0037 to REMOTE, then load pincodes to REMOTE via `wrangler d1 execute --remote --file
  scripts/pincodes.generated.sql` (regenerate first with node scripts/generate-pincodes-sql.mjs). 22MB CSV is the source.

### Untracked / decisions
- `pincode master.csv` (22MB) untracked — needed to regenerate load SQL on other laptop. Decide commit vs manual copy.
- `WhatsApp Image 2026-09-02...jpeg` — stray, NOT committed.

## PENDING DEPLOY QUEUE (oldest first) — all committed-or-pending, NOT on prod (last prod deploy = session 4 e77aaaa9)
- Session 5 (committed): audit bug fixes + sales_head role. Migrations 0033, 0034 -> apply REMOTE.
- Session 6 (this): sqft pricing, demo logins, pincode. Migrations 0035, 0036, 0037 -> apply REMOTE (+ load pincodes remote).
- Deploy order: REMOTE migrations 0033-0037 + remote pincode load, THEN build + `wrangler deploy --env production`,
  bump sw.js (now v35), verify /api/v1/notifications/vapid-public-key.

## THIS SESSION (session 5) — committed, NOT deployed (migrations LOCAL only)
Two NEW migrations, both ADD-only, applied to LOCAL only — REMOTE apply + deploy still pending (do on instruction):
`0033_reward_claim_milestone_unique.sql`, `0034_user_role_overrides.sql`.

### A. Whole-project bug audit + fixes (all non-breaking)
- **P0 milestone reward double-claim**: migration 0033 adds `reward_claims.kind` (backfilled from catalog) + partial UNIQUE index `idx_reward_claims_one_milestone_per_dealer WHERE kind='milestone'`. `additional-rewards.ts` redeemAdditionalReward inserts kind='milestone', catches UNIQUE -> "already chose".
- **P0 points redemption double-spend**: `reward-redemption.ts` ledger-debit insert now also guards `(SUM(delta) - pointsRequired) >= 0` (post-debit balance). Concurrent-safe (D1 serializes batches). Claim insert sets kind='standard'.
- **P0 client price drift**: mattress base price shown as "From ₹X" (base 72x36/5"). Added optional `isFromPrice` prop to CampaignPriceBlock (default false so product page stays exact); set on home banner + campaigns list; "From" prefix on home card + products list ProductRow campaign price. common.from key already existed.
- **P1 orphaned dealer**: `users.ts` updateAdminUser now runs validateRoleLinks + validateDealer/DistributorId when patch.status==="active" too (not just role/link changes) — activating a dealer/distributor with NULL store now throws.
- **P1 non-atomic writes**: updateOrderLineItems (item + order-total) and bulkUpdateAssignments (distributor + SE) each now a single db.batch. Order totals bind quote.quantity (validated).
- **P1 input validation**: added assertPositiveInt/assertNonNegativeAmount/assertPercent + MAX_ORDER_QUANTITY=10000 to api/utils.ts. buildPriceQuote (single choke point for order create+edit) now `assertPositiveInt(input.quantity)` (was Math.max(1,...)). createOrder INSERTs bind quote.quantity.
- **P2**: thicknessFactor logs warn on unrecognized thickness (still factor 1, NOT thrown — avoids breaking admin labels); calculateRewardPoints rounds once on total (was per-unit×qty); order-status blocks master_admin changing FROM 'delivered'; campaign discount capped 0-99 (was 0-100, prevents free); added `deleted_at IS NULL` to 2 order SELECTs (updateOrderStatus, handleOrderDelivered); requirePermission/requireAnyPermission null-check user -> 401.
- **NOT changed (documented)**: signup tombstone-resurrection (non-privilege-gaining, changing risks breaking re-signup); no full zod rewrite; admin numeric writes (product price/sqft rate) left (admin-trusted). SQL injection: none found. Order ownership/scope: solid. Delivered-order point credit: already safe (unique idx 0021).

### B. sales_head role (STRICTLY VIEW-ONLY) — Option A (override table, no users CHECK change, no downtime)
- Why: users.role CHECK can't be altered on prod D1 (rebuild fails FK — reset the DB last time). So sales_head is stored as base role 'admin_staff' + a row in NEW `user_role_overrides(user_id PK, role, created_at, updated_at)` (migration 0034, ADD-only). Effective role resolved at session time.
- `api/rbac.ts`: added `resolveEffectiveRole(db, userId, baseRole)` (reads override; falls back on missing table). `middleware/auth.ts` resolveSession SQL now LEFT JOIN user_role_overrides + COALESCE(ovr.role, u.role). Login paths (sessions.ts createSessionForUserRow + app.ts OTP verify ~285) call resolveEffectiveRole so immediate post-login role is correct.
- `shared/rbac-permissions.ts`: sales_head = READ-ONLY perms only (orders/dealers/catalog/campaigns/rewards/complaints/notifications/reports/assignments/visits :read). NO write/approve/reject/redeem/users/settings/audit/signup:review.
- Role unions updated: api/types.ts + src/lib/mock/distributor/types.ts.
- `users.ts`: OVERRIDE_ROLES map {sales_head:'admin_staff'} + baseRoleFor() + syncRoleOverride() (upsert on override role, delete otherwise). createAdminUser (both new + reuse-deleted paths) and updateAdminUser store baseRoleFor(role) in users.role and syncRoleOverride; updateAdminUser also drops sessions when role changes. USER_SELECT LEFT JOINs overrides as override_role; mapUserRow uses effectiveRole = override_role ?? role. validateRoleLinks treats sales_head like admin (no dealer/distributor links).
- `api/app.ts` admin gate (`admin.use("*")`) now also allows role==='sales_head' (read routes; writes still 403 via requirePermission).
- Client: getHomePath -> '/admin' for sales_head; admin route guard requireRoles adds sales_head; admin-shell nav is permission-driven (auto-correct) + roleLabel "Sales Head"; user create dropdown (new.tsx) + edit dropdown ($userId.tsx, master_admin only) add sales_head option. useAdminPermissions uses session permissions (works automatically).
- KNOWN LIMITATION: Users list "filter by role" uses raw users.role in SQL, so filtering by 'sales_head' won't match (they show under admin_staff/all). Cosmetic; view-only role.
- To create: Admin -> Users -> New/edit -> "Sales Head (view only)". Build GREEN, 0034 applied LOCAL, table verified.

## SESSION 4 (previous) — DEPLOYED to production (Version e77aaaa9)

## THIS SESSION (session 4) — ALL committed AND DEPLOYED to production
Production URL: https://backrest-pwa.shahharsh143-hs.workers.dev. Latest deploy Version ID: `e77aaaa9-a1bb-4993-b6f3-8f5d006b8b72`.
SW cache bumped to **v34** (was v32). Two migrations applied to LOCAL and **REMOTE** D1: `0031_push_delivery_status.sql`, `0032_scheduled_announcements.sql` (both ADD-only).

### A. Web Push notification system — full 9-phase overhaul (all deployed, verified working)
- **Instrumentation + pruning** (`0031` migration adds `last_attempt_at`/`last_status`/`failure_count` to push_subscriptions; `api/services/push-notifications.ts` `sendPushForNotifications` records status per attempt, prunes on 401/403/404/410, returns `PushSendResult {attempted,succeeded,statuses}` + logs `[push] send complete`).
- **Toggle no longer lies** — new `GET /api/v1/notifications/push-status` + `getPushSubscriptionStatus(db,userId)`; toggle (`src/components/shared/push-notification-toggle.tsx`) awaits real subscribe result + checks browser+server on mount.
- **Fallback fix** (`src/hooks/use-notification-bridge.ts`): browser polling fallback suppressed ONLY when server confirms push delivering (`isPushDeliveringViaServer()`, 2h window).
- **SW click** (`public/sw.js` notificationclick): focus()+postMessage only (removed double-nav client.navigate); openWindow only when no client. Logged-out deep-link: NEW `src/lib/pending-notification-target.ts` (sessionStorage store/consume), stored in `src/lib/auth-guard.ts` `requireUser()` before redirect to "/", replayed in `src/routes/index.tsx` `resolvePostLoginPath`.
- **Re-sync on login**: `resyncPushSubscription()` in browser-notifications.ts, called from use-notification-bridge effect (silent upsert of existing browser sub).
- **Badge PNG**: `public/icons/badge-monochrome.png` (96x96, generated via sharp from the svg); payload + sw.js badge -> .png.
- VERIFIED live via demo-login (9999999999 -> master_admin) POST /push-test => `{attempted:6,succeeded:3,statuses:[410,410,201,410,201,201]}` — 201=delivered, 410 auto-pruned. Push pipeline HEALTHY. `push-test` route now sends SYNCHRONOUSLY (createNotification with `{skipPush:true}` option added to `api/services/notifications.ts`, then awaits sendPushForNotifications, returns result) so failures surface. If a device doesn't get it, re-subscribe on that device (stale 410 sub); iOS must be installed to home screen.

### B. Scheduled announcements (Phase 6) — `0032` migration NEW table `scheduled_announcements`
- `api/services/system-notifications-admin.ts`: `createAnnouncement` — if sendAt future, INSERT into scheduled_announcements (sent=0), NOT immediate; else `sendAnnouncementNow`. `dispatchScheduledAnnouncements(db)` in cron (`workers/cron.ts` `handleCron(env, ctx?)` now sets `setPushEnv(effectiveEnv(env))`+`resolveExecutionContext(ctx)` so cron push has VAPID; `src/server.ts` passes ctx). `api/app.ts` exported `effectiveEnv`.
- **TIMEZONE BUG FIXED**: form sent naive `datetime-local` ("2026-09-04T11:10", no TZ) → server (UTC) read it as UTC → fired ~5.5h late. Fix: client `src/routes/admin/notifications/index.tsx` `toIsoInstant()` converts to UTC ISO before send (both compose+update); server `normalizeSendAt()` stores UTC ISO. Cron compares `send_at <= nowIso()` (both UTC ISO now — string compare is chronological).
- **Scheduled (sent=0) announcements now VISIBLE in admin list** — `listAnnouncements` merges pending scheduled_announcements rows (marked `scheduled:true`); before, they only lived in the new table and looked unsaved.
- GOTCHA fixed: JSDoc containing "*/15" prematurely closed a block comment and broke the build; reworded to "every-15-minutes". NEVER put `*/<digit>` in a block comment.

### C. OTP login fix (CRITICAL)
- `api/services/otp.ts` `generateOtpCode` used `123456` only when `ENVIRONMENT !== "production"`, IGNORING `MOCK_OTP`. Prod worker runs ENVIRONMENT="production" + MOCK_OTP=1, so it generated a RANDOM code only logged server-side → new users could NOT log in (123456 failed). FIX: `generateOtpCode(env)` now returns 123456 whenever `isDemoModeEnabled(env)` (MOCK_OTP=1 OR DEMO_LOGINS_ENABLED=1), else random. Caller `api/app.ts` passes `effectiveEnv(c.env)`. VERIFIED 123456 works live.
- **WHEN GOING FULLY LIVE**: set `MOCK_OTP=0` + `DEMO_LOGINS_ENABLED=0` (and wire a real SMS provider). Until then EVERY account's OTP is 123456 — fine for testing, unsafe for real launch.

### D. Order review UI
- Removed the "Delivery — Free · 5–7 days" line from the order review summary (`src/routes/products/$productId.tsx`, was `<Line label={common.delivery} value={common.deliveryFree}/>`).

## OPEN / PENDING (not done)
- **Sq.Ft pricing change REQUESTED, NOT started.** User wants ₹/Sq.Ft rate to be PER (product + thickness), each configurable. CURRENT logic (explained to user): NO per-sqft rate exists today — `api/services/mattress-pricing.ts` uses base price for base 72"×36", `sizeAreaFactor = area/(72*36)` clamped >=1, times a HARD-CODED `THICKNESS_MULTIPLIERS` table (2"→0.45 … 5"→1.0 … 10"→1.45) identical for all products. Final = basePrice × sizeFactor × thicknessMultiplier. To do the ask: switch mattresses to `Final=(L/12)*(W/12)*rate` and make rate configurable per product+thickness (DB ADD-only table, admin editor rows, client mirror `src/lib/mattress-size.ts`, order line items capturing thickness+rate). ASKED USER 4 clarifying Qs (replace base-price model entirely? which price MRP/dealer/both? keep 1" standard-size snap/floor or use raw inches? where admin enters rates?) — AWAITING ANSWERS before building.
- **Orphaned dealer 9821650772 ("Harsh Shah")**: self-signup user is `status=active` but `dealer_id=NULL` with a still-`pending` signup_applications row — should not be reachable. Fix path given to user: approve the pending signup (Admin → Assignments → **Approvals tab**, needs `signup:review` perm) which creates the dealers store + assigns distributor. Possible hardening (NOT done): prevent a self-signup user going active without a dealer store / clear stale pending signup on admin create.

## NOTES on assignment model (for the above)
- Dealer = row in `dealers` table; dealer→distributor link is `dealers.distributor_id` (single FK, set at creation). Admin-create user = instant `status='active'` + creates dealer store (users.ts). Self-signup = `pending_approval` until admin approves (signup-review.ts creates the dealers row). Assignments UI lists `dealers` rows; "unassigned distributor" filter = `distributor_id IS NULL`. Search matches store_name/code/location (NOT phone).


## THIS SESSION (session 3) — committed, NOT yet deployed
- **Reward % now computed on DEALER PRICE (not MRP) in the admin product editor.** The runtime rule
  (`shared/reward-points.ts` → `buildPriceQuote` in api/services/pricing.ts) was ALREADY correct
  (`calculateRewardPoints(dealerPrice, reward_percent, qty)` = round(dealer × percent / 10)). The BUG
  was only in the ACTIVE editor `src/routes/admin/products/new.tsx` (`ProductEditor`, used by both
  new + `$productId` edit pages): it labeled the field "Reward % of MRP" and previewed
  `round(mrp × rewardPercent/100)`. Fixed: relabeled "Reward % of Dealer Price", preview now uses
  `calculateRewardPoints(product.dealerPrice, rewardPercent)`, and the onChange recomputes `points`
  from dealer price. NOTE: the unused duplicate `src/components/admin/product-editor.tsx` already had
  the correct dealer-price logic — it's just not wired to routes (still safe to delete).
- **Mattress buffer pricing REVIEWED — no code change.** User said "buffer pricing not proper". Traced
  `ceilToStandardWithBuffer` (api/services/mattress-pricing.ts + client mirror src/lib/mattress-size.ts).
  Verified via a scratch script that the current subtract-then-ceil logic ALREADY matches the user's
  boundary table exactly (each standard charges itself and +1": 72→72/73, 75→75/76, 78→78/79, 84→84/85;
  widths 30/36/42/48/60/66/72/75/78/84 same). Examples 2,3,4 and 73×73→72×72 all correct. The ONLY
  mismatch is the user's Example 1 ("74"→72"), which CONTRADICTS their own table + algorithm
  (74 > 72+1 → next standard 75). Concluded Example 1 is a spec typo; asked user for a concrete
  wrong-price case before changing anything. User said "okay ill let you know" — STILL PENDING.
- **Build verified GREEN on this laptop**: `bun install` (620 pkgs) then `bun run build` — client
  ✓ 10.35s, SSR ✓ 1.73s, postbuild wrangler.json patch ran. No TS/build errors.
- **bun.lock was STALE** (missing hono, i18next, react-i18next, @pushforge/builder, @fontsource/*,
  @cloudflare/workers-types, etc. that are in package.json). `bun install` reconciled it (+315/-4).
  Committed the fixed lockfile.

## ENVIRONMENT (this laptop — Harsh's, differs from office)
- **PowerShell execution policy BLOCKS `npm`/`npx`/`.ps1` shims** ("running scripts is disabled").
  Fix: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. OR call `.cmd` shims / use bun directly.
- **`bun` is installed but NOT on PATH**: full path `C:\Users\Harsh\.bun\bin\bun.exe` (bun 1.4.0).
  Add to PATH: `[Environment]::SetEnvironmentVariable("Path", $env:Path + ";$env:USERPROFILE\.bun\bin", "User")`.
- **node** v24.14.1 is on PATH and works. To run tooling here without PATH fixes, call bun by full path,
  e.g. `& "$env:USERPROFILE\.bun\bin\bun.exe" run build`.
- node_modules did NOT exist on fresh pull — must `bun install` first on this laptop.
- Deploy note in this file says `npm run build` — on this laptop use `bun run build` (or fix PATH first).

## Project
BackRest — mattress dealer portal PWA. Stack: TanStack Start (React, SSR) + Hono API +
Cloudflare Workers + D1 (SQLite). Production URL: https://backrest-pwa.shahharsh143-hs.workers.dev
Deploy: `npm run build` then `npx wrangler deploy --config .output/server/wrangler.json --env production`.
Demo/test mode stays ON in prod (Worker vars `MOCK_OTP=1`, `DEMO_LOGINS_ENABLED=1`). Demo admin phone `9999999999`.
Service worker cache version lives in `public/sw.js` (`const CACHE = "backrest-static-vNN"`) — bump on every frontend deploy. Currently at **v32**.
Last deploy Version ID: `74206887-0f3d-430d-a7c0-3436f9b26cdc`.

## DEPLOYED to production (all live now)

### A. Push notifications (fixed + working)
- VAPID key mismatch was the "no notification" root cause. Matched pair regenerated; both secrets re-set. Public key live: `BOH-uPth7cg0s5zr33CLc26Zfp61BwaLfpABULxUqldui0n8PLDpn2R7gUZlaTCMTKhBST5WkME0o8fjpQYXkIs` (verified after latest deploy).
- Diagnostic logging kept in `api/services/push-notifications.ts` / `notifications.ts` (booleans/host only, harmless).
- Icon: `public/icons/icon-192.png` is the correct mark. Badge fixed → `public/icons/badge-monochrome.svg` (monochrome). `public/icons/icon-512-maskable.png` regenerated with padding. sw.js honors payload icon/badge.
- Admin notifications page: "Enable notifications" button added; test button gated on real subscription.
- GOTCHA: deploying can DROP secrets — always verify `/api/v1/notifications/vapid-public-key` after deploy (did, OK).

### B. Mattress sizing / pricing
- Any size allowed; base 72"×36" is the price FLOOR (`sizeAreaFactor` clamped ≥1.0). Upper cap 84"×84".
- 1" configurable standard-size buffer (`ceilToStandardWithBuffer`, env `STANDARD_SIZE_BUFFER_IN`, default 1) — 73"→72". Wired via `configureStandardSizeBuffer` in api/app.ts middleware. Frontend mirror in src/lib/mattress-size.ts.
- Admin order editor blur snaps to quarter-inch only (preserves custom size).

### C. Admin Reports
- Area Sqft bug FIXED (sizeSqftExpr tolerant of separators/missing inch marks; verified 145/146 lines now compute).
- Cascading dependent filters (Territory→Distributor→SalesExec→Dealer; territory DERIVED from dealers.location — NO territory table). Child selections prune on parent change.
- Multi-select on all filters (src/components/ui/multi-select.tsx; backend csvList/inClause → IN()). Area drill scopes to hasArea (sqft>0).

### D. Distributor Dealer Visits tab
- New route src/routes/distributor/dealer-visits/index.tsx + nav in more.tsx. Backend GET /api/v1/visits distributor branch takes optional salesExecutiveUserId/dealerId (ANDed within distributor scope).

### E. Admin "Sales Executives" view (role-agnostic, KEPT)
- NEW read-only oversight of ALL sales executives: api/services/sales-executives.ts (listSalesExecutives/getSalesExecutiveDetail, unscoped, correlated aggregates, no N+1); admin.get(/sales-executives + /:id) gated `dealers:read`; client src/services/admin/sales-executives.ts; routes src/routes/admin/sales-executives/{index,$seId}.tsx; admin-shell nav item (Contact icon); admin.salesExecutives i18n. Works for master_admin + admin_staff.

## Sales Head role — ATTEMPTED then FULLY REVERTED (do not retry casually)
- Goal was a view-only sales_head role. It required adding 'sales_head' to the users.role CHECK constraint.
- BLOCKER (confirmed exhaustively): Cloudflare D1 will NOT rebuild the `users` table (needed to change a CHECK) on this populated prod DB. ~11 tables have FKs to users (+ circular users↔dealers), and D1 ignores PRAGMA foreign_keys=OFF, defer_foreign_keys, and writable_schema (SQLITE_AUTH). Every surface — `wrangler d1 migrations apply`, `--file` (single-txn import), single `--command`, AND the Cloudflare dashboard console — fails with "FOREIGN KEY constraint failed" and ROLLS BACK. Data has ZERO actual FK violations (PRAGMA foreign_key_check empty). Prod data NEVER changed.
- A child-first FK-strip rebuild (drop `REFERENCES users(id)` from 11 children, then rebuild users) SUCCEEDS on local (empty FK data) but FAILS on remote (D1 checks FK at each DROP of a still-referenced parent like `dealers`). Would require stripping FKs across ~12 interdependent tables in topological order — too risky for one role.
- DECISION: reverted sales_head entirely (grep confirms ZERO references). Removed from rbac-permissions, api/types, mock types, api/app.ts (admin gate/visit-summary/push link), api/services/users.ts, auth getHomePath, admin route guard, use-session isAdmin, admin-shell/last-edited-by labels, users new/$userId dropdowns, demo-phones + demo-users, index.tsx demo card, en/hi i18n. Migration 0031 DELETED. Removed demo user from LOCAL db.
- Kept the Sales Executives view (section E) — it's role-agnostic and useful.
- IF sales_head is wanted later: set up a STAGING D1 (restore a prod snapshot into a throwaway DB), test a full 12-table FK-strip rebuild there, then apply to prod in a maintenance window. Do NOT attempt piecemeal on prod again.

## Git status
- Working tree has this whole session's changes (features A–E + sales_head revert). Earlier in the session `main` was clean/up-to-date with origin, meaning the manual prod deploys did NOT commit. NEEDS a commit + push to sync git with what's live. Includes: many api/* + src/* files, new files (multi-select.tsx, sales-executives service/routes, dealer-visits route, badge-monochrome.svg), and the session-context. routeTree.gen.ts shows modified (CRLF churn OK to include or discard).

## Decisions / approaches agreed
- Sizing: base 72"×36" floor, 1" configurable buffer, upper cap 84"×84".
- Sales Head: reverted; revisit only via staging DB + maintenance window.
- User tests locally before deploy; deploys done manually / on explicit instruction.
- Migrations must apply to remote D1 BEFORE deploying code that uses them (learned the hard way with 0031).

## Known follow-ups (not done)
- Commit + push the working tree to `main` so git matches production.
- `src/components/admin/product-editor.tsx` unused duplicate — safe to delete.
- Push diagnostic logging can be stripped later.
- Report multi-select refetches per toggle — acceptable at current volumes.
- `docs/codebase-audit-report.md` never saved (top items: A1 non-atomic updateOrderLineItems, B1 notification broadcast N+1, D1 no zod body validation).

## Gotchas / environment notes (D1 + Windows)
- **D1 cannot rebuild an FK-referenced table on a populated DB** — no PRAGMA escape hatch works. This is the biggest lesson from this session. Any migration that DROP/rebuilds users/dealers/orders/etc. will fail with FK constraint + roll back. Design migrations to only ADD columns/tables, never rebuild FK-referenced parents.
- Windows + PowerShell: `core.autocrlf=true` makes `src/routeTree.gen.ts` show modified (CRLF/LF) — harmless; discard with `git -c core.autocrlf=false checkout HEAD -- src/routeTree.gen.ts`.
- eslint shows ~1200 `prettier/prettier "Delete ␍"` errors repo-wide from CRLF — NOT real. New files were `prettier --write` normalized.
- PowerShell swallows long-line output + mangles `×`(use char(215)) and `$` in paths. `wrangler d1 execute --command` has an ~8KB Windows command-line limit; use `--file` for big SQL. `--file` UTF-16/BOM is rejected — write SQL as UTF-8 no-BOM. `--file` runs as one uploaded transaction; `--command` (multi-statement) also one txn but length-limited. `wrangler d1 migrations apply` splits per statement and IGNORES defer_foreign_keys. Ctrl+C interrupts have been frequent — run one clean command at a time.
- Write query results to a temp .out file and read it; clean up temp files after.
- `.env.production` and scratch files are gitignored — never commit.
