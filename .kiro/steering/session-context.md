---
inclusion: always
---

# Session Context — cross-laptop handoff

This file is auto-written on "sync" so Kiro on the other laptop can resume instantly.
Last updated: 2026-09-03 (session 3 — reward %, buffer review, env setup).

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
