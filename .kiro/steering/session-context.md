---
inclusion: always
---

# Session Context — cross-laptop handoff

This file is auto-written on "sync" so Kiro on the other laptop can resume instantly.
Last updated: 2026-09-03 (session 2b).

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
