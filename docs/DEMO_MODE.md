# Demo mode (dealer app)

The demo dealer login uses phone **`9876543210`** (OTP `123456`).

## What uses mock data

| Area | Source | Notes |
|------|--------|--------|
| **Home** (`/home`) | `src/lib/demo-data.ts` | Rich static dashboard when `isDemoDealer(phone)` |
| **Formatting helpers** | `demo-data.ts` (`inr`, `orderSteps`, etc.) | UI constants only — not business data |

## What always uses the real API

| Area | Endpoint |
|------|----------|
| Product catalog list | `GET /api/v1/catalog` |
| Product detail & ordering | `GET /api/v1/catalog/products/:id` |
| Orders, rewards, campaigns, complaints, profile | Respective `/api/v1/*` routes |

## Important

- Do **not** override API responses with mock data on error (no silent fallbacks).
- Demo home is intentionally static for sales demos; all transactional flows hit D1.
- Product IDs in the catalog always come from the seeded database so list → detail → order stays consistent.
