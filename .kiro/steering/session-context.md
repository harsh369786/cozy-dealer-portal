---
inclusion: always
---

# Session Context — cross-laptop handoff

This file is auto-written on "sync" so Kiro on the other laptop can resume instantly.
Last updated: 2026-08-28.

## Project
BackRest — mattress dealer portal PWA. Stack: TanStack Start (React, SSR) + Hono API +
Cloudflare Workers + D1 (SQLite). Production URL: https://backrest-pwa.shahharsh143-hs.workers.dev
Deploy: `npm run build` then `npx wrangler deploy --config .output/server/wrangler.json --env production`.
Demo/test mode stays ON in prod (Worker vars `MOCK_OTP=1`, `DEMO_LOGINS_ENABLED=1`). Demo admin phone `9999999999`.
Service worker cache version lives in `public/sw.js` (`const CACHE = "backrest-static-vNN"`) — bump it on every frontend deploy. Currently at **v26**.

## What we worked on this session
1. **Margin-based pricing model** (big one). Product master holds a fixed MRP; each price
   list (T1/T2/T3…) holds PER PRODUCT a Dealer Margin % and a Distributor Margin %.
   - Dealer Price = MRP × (1 − DealerMargin%/100); Distributor Price = Dealer Price ÷ (1 + DistMargin%/100), rounded half-up.
   - Prices are size-scaled at order time (mattress area × thickness), MRP stored as the base 72"×36" absolute (≈ /sqft × 18).
   - Migration `migrations/0030_pricing_margins.sql` adds `dealer_margin_percent` + `distributor_margin_percent` to `pricing_tier_product_prices`, and `dealer_margin_percent` to `order_items`; backfills margins from old absolute prices.
   - Engine: `api/services/pricing-tiers.ts` (calculateDealerPrice, calculateDistributorPrice, resolvePricingContext, marginsFromContext), `api/services/pricing.ts` buildPriceQuote is now tier-aware, order writes in `api/services/orders.ts`.
   - Admin UI: `src/routes/admin/products/new.tsx` (the REAL ProductEditor the routes use — NOT `src/components/admin/product-editor.tsx`, which is an unused duplicate).
2. **Pricing UI fixes:** per-price-list margin table + multi-item free-items list restored; fixed a `t is not defined` crash (ProductEditor now calls `useTranslation()`); margins display rounded to 2 decimals (display-only); removed the "Legacy points (display)" field; mobile shows stacked cards instead of a cramped table.
3. **Auth / unexpected-logout fixes:** cookie changed to `SameSite=Lax` (`api/middleware/auth.ts`); `getCurrentUser` (`src/services/auth.ts`) tolerates a transient 401/403 (retries once before clearing); distributor `__layout` guard now uses async `requireRoles(["distributor","sales_executive"])` instead of sync `getRole()`.
4. **Earlier this session:** reports drill-down scroll fix, custom mattress size preserved (no ceil-snap on blur), 0%-campaign phantom-discount fix, free-item JSON label formatting, sq.ft rate dropdowns, an "all products" 25% campaign confirmed working.
5. **Wrote** `docs/pricing-lists-guide.md` (non-technical admin guide for price lists).

## Completed & deployed
- All of the above is deployed to production (last deploy SW **v26**, migration 0030 applied to remote D1).
- Git: `main` is clean and pushed. History is linear.

## In progress / pending
- Nothing actively mid-change. Working tree was clean at sync time.

## Decisions / approaches agreed
- Pricing rounding: whole-rupee, round-half-up (user confirmed, not paise).
- Legacy-margin decimals: **display rounding only** — do NOT round the stored DB values (keeps existing prices exactly).
- Distributor margin is per-product per price list; the per-tier margin is only a default/fallback.
- User wants to **test locally before deploying** — do NOT deploy without an explicit "deploy" instruction.
- Migrations must be applied to remote D1 (`npx wrangler d1 migrations apply backrest-db --remote --config wrangler.toml`) BEFORE deploying code that uses new columns.

## Known follow-ups (not done yet)
- `src/components/admin/product-editor.tsx` is an unused duplicate editor — safe to delete later to avoid confusion.
- `scripts/test-pricing-tiers.ts` still uses the old absolute-price API and asserts old numbers; needs rewrite to the margin model (not wired into any npm script, so it doesn't block builds).

## Gotchas / environment notes
- Windows + PowerShell. `core.autocrlf=true` causes `src/routeTree.gen.ts` (generated) to show as modified due to CRLF/LF only — harmless, discard with `git -c core.autocrlf=false checkout HEAD -- src/routeTree.gen.ts`.
- PowerShell swallows console output on long lines; write results to a temp file and read it, then clean up temp files.
- `.env.production` and scratch files (`patch_*.py`, `deploy*.txt`, `audit_report*.md`, `.cursor/`) are gitignored — never commit them.
