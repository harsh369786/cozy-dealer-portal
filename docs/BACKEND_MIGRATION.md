# BackRest PWA — Backend Migration Guide

## Architecture

- **API**: Hono app at `/api/v1/*` (see `api/app.ts`)
- **Database**: Cloudflare D1 (`migrations/0001_initial.sql`)
- **Assets**: R2 bucket `backrest-assets` (optional)
- **Async**: Queue `whatsapp-outbox` + Cron every 15 minutes
- **Local dev**: SQLite file `.local.db` via `better-sqlite3` when D1 binding is absent

## Local development

```bash
npm install
npm run dev
```

On first API request, migrations run and seed data loads from `scripts/seed-data.ts`.

### Test logins (staging OTP: `123456`)

| Role | Phone |
|------|-------|
| Dealer | `9876543210` |
| Distributor | `9823044120` |
| Admin | `9999999999` |

## Cloudflare deployment

1. Create D1 database and R2 bucket in Cloudflare dashboard
2. Update `wrangler.toml` with real `database_id`
3. Apply migrations:

```bash
npx wrangler d1 execute backrest-db --file=./migrations/0001_initial.sql
```

4. Seed production/staging:

```bash
npx wrangler d1 execute backrest-db --command="SELECT COUNT(*) FROM users"
# If empty, run seed via worker or import SQL export
```

5. Deploy via existing TanStack Start / Nitro Cloudflare pipeline

## Environment

| Variable | Purpose |
|----------|---------|
| `VITE_API_BASE_URL` | Empty = same origin |
| `JWT_SECRET` | Session signing (Workers secret) |
| `ENVIRONMENT` | `staging` enables mock OTP `123456` |

## Production cutover checklist

1. Run D1 migrations on production database
2. Import catalog, dealers, distributors from staging seed
3. Create real user accounts (replace seed phones)
4. Configure WhatsApp provider secrets and replace `MockOtpProvider` / mock WhatsApp logger
5. Point custom domain; enable `Secure` cookie flag
6. Verify Cron trigger and Queue consumer bindings in `wrangler.toml`
7. Remove `.local.db` from any deployment artifact
8. Smoke test: OTP login → place order → distributor approve → points ledger credit

## Data migration notes

- **Orders / order_items**: Immutable snapshots; never update line items after insert
- **Points**: Credited on order **approval** (see `api/services/orders.ts`)
- **localStorage**: No longer used for orders, notifications, or auth
- **Client WhatsApp**: Removed; all sends via `whatsapp_outbox` queue

## API documentation

See plan file `production_backend_architecture_99d645da.plan.md` section 4 for full endpoint list.

Admin UI: `/admin/*`  
Distributor: `/distributor/*`  
Dealer: `/home`, `/products`, `/orders`, `/campaigns`, `/rewards`
