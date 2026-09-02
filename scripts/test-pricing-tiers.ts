/**
 * Pricing-tier formula + quote/order snapshot tests against the local API handler.
 * Run: npm run test:pricing
 */
import { handleApiRequest } from "../api/app.ts";
import { createDevDatabase } from "../api/db/sqlite-d1.ts";
import { calculateDistributorPrice } from "../api/services/pricing-tiers.ts";

const BASE = "http://localhost";
const OTP = "123456";

function assert(name: string, condition: boolean, detail?: string) {
  if (!condition) throw new Error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`  ✓ ${name}`);
}

async function login(phone: string): Promise<string> {
  await handleApiRequest(
    new Request(`${BASE}/api/v1/auth/otp/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    }),
  );
  const res = await handleApiRequest(
    new Request(`${BASE}/api/v1/auth/otp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code: OTP }),
    }),
  );
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/backrest_session=([^;]+)/);
  if (!match) throw new Error(`Login failed for ${phone}: ${res.status}`);
  return match[1];
}

async function api(path: string, session: string, init: RequestInit = {}): Promise<Response> {
  return handleApiRequest(
    new Request(`${BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        cookie: `backrest_session=${session}`,
        ...(init.headers as Record<string, string>),
      },
    }),
  );
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(`${res.status} ${JSON.stringify(body)}`);
  }
  return body;
}

function testFormula() {
  console.log("Formula");
  assert("120 @ 20% → 100", calculateDistributorPrice(120, 20) === 100);
  assert("round down < 0.50", calculateDistributorPrice(99.4, 0) === 99);
  assert("round up = 0.50", calculateDistributorPrice(99.5, 0) === 100);
  assert("round up > 0.50", calculateDistributorPrice(99.75, 0) === 100);
  assert("T2 200 @ 15% → 174", calculateDistributorPrice(200, 15) === 174);
}

async function main() {
  testFormula();

  const db = await createDevDatabase();
  const adminSession = await login("9999999999");
  const dealerSession = await login("9876543210");
  const distSession = await login("9823044120");

  const products = await db
    .prepare(`SELECT id FROM products WHERE deleted_at IS NULL AND active = 1 LIMIT 2`)
    .all<{ id: string }>();
  const productA = products.results[0]?.id;
  const productB = products.results[1]?.id;
  assert("seed has products", Boolean(productA && productB));

  const t1Before = await db
    .prepare(`SELECT distributor_margin_percent as m FROM pricing_tiers WHERE id = 'tier-t1'`)
    .first<{ m: number }>();
  const origMargin = Number(t1Before?.m ?? 20);
  const origPrices = await db
    .prepare(
      `SELECT product_id, dealer_price FROM pricing_tier_product_prices WHERE tier_id = 'tier-t1' AND product_id IN (?, ?)`,
    )
    .bind(productA, productB)
    .all<{ product_id: string; dealer_price: number }>();

  const me = await json<{ user: { id: string; dealerId?: string } }>(await api("/api/v1/auth/me", dealerSession));
  const dealerUser = me.user;
  const origDealerTier = await db
    .prepare(`SELECT pricing_tier_id as t FROM dealers WHERE id = ?`)
    .bind(dealerUser.dealerId)
    .first<{ t: string | null }>();

  let t2Id: string | null = null;

  try {
    const t1Save = await json<{ id: string }>(
      await api("/api/v1/admin/pricing-tiers/tier-t1", adminSession, {
        method: "PATCH",
        body: JSON.stringify({ code: "T1", name: "Tier 1", distributorMarginPercent: 20 }),
      }),
    );
    assert("T1 saved", t1Save.id === "tier-t1");

    for (const productId of [productA, productB]) {
      const product = await json<{
        id: string;
        name: string;
        category: string;
        guarantee: string;
        mrp: number;
        dealerPrice: number;
        thicknesses: string[];
        rewardPercent: number;
        rewardEligibility: string;
        blurb: string;
        image: string;
        status: string;
        tierPrices?: Array<{ tierId: string; dealerPrice: number }>;
      }>(await api(`/api/v1/admin/products/${productId}`, adminSession));
      const dealerPrice = productId === productA ? 120 : 240;
      await json(
        await api(`/api/v1/admin/products/${productId}`, adminSession, {
          method: "PATCH",
          body: JSON.stringify({
            ...product,
            dealerPrice,
            tierPrices: (product.tierPrices ?? []).map((row) => ({
              tierId: row.tierId,
              dealerPrice: row.tierId === "tier-t1" ? dealerPrice : row.dealerPrice,
            })),
            // Client-supplied distributor price must be ignored.
            distributorPrice: 1,
          }),
        }),
      );
    }

    const adminProduct = await json<{
      tierPrices: Array<{
        tierId: string;
        dealerPrice: number;
        distributorMarginPercent: number;
        distributorPrice: number;
      }>;
    }>(await api(`/api/v1/admin/products/${productA}`, adminSession));
    const t1Row = adminProduct.tierPrices.find((row) => row.tierId === "tier-t1");
    assert("admin shows T1 dealer 120", t1Row?.dealerPrice === 120);
    assert("admin shows T1 margin 20", t1Row?.distributorMarginPercent === 20);
    assert("admin calculated dist 100", t1Row?.distributorPrice === 100);

    const dealerQuote = await json<{ dealerPrice: number; distributorPrice: number; unitPrice: number }>(
      await api("/api/v1/catalog/price-quote", dealerSession, {
        method: "POST",
        body: JSON.stringify({ productId: productA, quantity: 1, dealerPrice: 1, unitPrice: 1 }),
      }),
    );
    assert("dealer quote dealer price 120", dealerQuote.dealerPrice === 120);
    assert("dealer quote unit is dealer price", dealerQuote.unitPrice === 120);
    assert("quote ignores client unitPrice", dealerQuote.unitPrice !== 1);
    assert("dealer quote also returns dist 100", dealerQuote.distributorPrice === 100);

    const distQuote = await json<{ unitPrice: number; dealerPrice: number; distributorPrice: number }>(
      await api("/api/v1/catalog/price-quote", distSession, {
        method: "POST",
        body: JSON.stringify({ productId: productA, quantity: 1 }),
      }),
    );
    assert("distributor quote unit is dist price 100", distQuote.unitPrice === 100);
    assert("distributor still sees dealer 120", distQuote.dealerPrice === 120);

    const quoteB = await json<{ dealerPrice: number; distributorPrice: number }>(
      await api("/api/v1/catalog/price-quote", dealerSession, {
        method: "POST",
        body: JSON.stringify({ productId: productB, quantity: 1 }),
      }),
    );
    assert("second product T1 240 → dist 200", quoteB.dealerPrice === 240 && quoteB.distributorPrice === 200);

    const existingTiers = await json<{ items: Array<{ id: string; code: string }> }>(
      await api("/api/v1/admin/pricing-tiers", adminSession),
    );
    const existingT2 = existingTiers.items.find((tier) => tier.code === "T2TEST");
    const t2 = existingT2
      ? await json<{ id: string }>(
          await api(`/api/v1/admin/pricing-tiers/${existingT2.id}`, adminSession, {
            method: "PATCH",
            body: JSON.stringify({ code: "T2TEST", name: "Tier 2 test", distributorMarginPercent: 15 }),
          }),
        )
      : await json<{ id: string }>(
          await api("/api/v1/admin/pricing-tiers", adminSession, {
            method: "POST",
            body: JSON.stringify({ code: "T2TEST", name: "Tier 2 test", distributorMarginPercent: 15 }),
          }),
        );
    t2Id = t2.id;

    const productAfterT2 = await json<{
      tierPrices: Array<{ tierId: string; dealerPrice: number }>;
      name: string;
      category: string;
      guarantee: string;
      mrp: number;
      dealerPrice: number;
      thicknesses: string[];
      rewardPercent: number;
      rewardEligibility: string;
      blurb: string;
      image: string;
      status: string;
    }>(await api(`/api/v1/admin/products/${productA}`, adminSession));
    await json(
      await api(`/api/v1/admin/products/${productA}`, adminSession, {
        method: "PATCH",
        body: JSON.stringify({
          ...productAfterT2,
          dealerPrice: 120,
          tierPrices: productAfterT2.tierPrices.map((row) => ({
            tierId: row.tierId,
            dealerPrice: row.tierId === t2Id ? 200 : row.tierId === "tier-t1" ? 120 : row.dealerPrice,
          })),
        }),
      }),
    );

    await json(
      await api(`/api/v1/admin/users/${dealerUser.id}`, adminSession, {
        method: "PATCH",
        body: JSON.stringify({ pricingTierId: t2Id }),
      }),
    );

    const t2Quote = await json<{ dealerPrice: number; distributorPrice: number; distributorMarginPercent: number }>(
      await api("/api/v1/catalog/price-quote", dealerSession, {
        method: "POST",
        body: JSON.stringify({ productId: productA, quantity: 1 }),
      }),
    );
    assert("dealer on T2 sees 200", t2Quote.dealerPrice === 200);
    assert("T2 margin 15", t2Quote.distributorMarginPercent === 15);
    assert("T2 dist 174", t2Quote.distributorPrice === 174);

    await json(
      await api(`/api/v1/admin/users/${dealerUser.id}`, adminSession, {
        method: "PATCH",
        body: JSON.stringify({ pricingTierId: "tier-t1" }),
      }),
    );

    const placed = await json<{
      id: string;
      totalValue: number;
      items: Array<{ dealerPrice: number; distributorPrice: number; distributorMarginPercent: number }>;
    }>(
      await api("/api/v1/orders", dealerSession, {
        method: "POST",
        body: JSON.stringify({
          productId: productA,
          quantity: 1,
          dealerPrice: 1,
          unitPrice: 1,
          totalValue: 1,
        }),
      }),
    );
    assert("order snapshots dealer 120", placed.items[0]?.dealerPrice === 120);
    assert("order snapshots dist 100", placed.items[0]?.distributorPrice === 100);
    assert("order total is dealer line", placed.totalValue === 120);
    assert("order ignores client prices", placed.totalValue !== 1);

    await json(
      await api("/api/v1/admin/pricing-tiers/tier-t1", adminSession, {
        method: "PATCH",
        body: JSON.stringify({ code: "T1", name: "Tier 1", distributorMarginPercent: 10 }),
      }),
    );
    const productNow = await json<{
      name: string;
      category: string;
      guarantee: string;
      mrp: number;
      dealerPrice: number;
      thicknesses: string[];
      rewardPercent: number;
      rewardEligibility: string;
      blurb: string;
      image: string;
      status: string;
      tierPrices: Array<{ tierId: string; dealerPrice: number }>;
    }>(await api(`/api/v1/admin/products/${productA}`, adminSession));
    await json(
      await api(`/api/v1/admin/products/${productA}`, adminSession, {
        method: "PATCH",
        body: JSON.stringify({
          ...productNow,
          dealerPrice: 180,
          tierPrices: productNow.tierPrices.map((row) => ({
            ...row,
            dealerPrice: row.tierId === "tier-t1" ? 180 : row.dealerPrice,
          })),
        }),
      }),
    );

    const historical = await json<{
      totalValue: number;
      items: Array<{ dealerPrice: number; distributorPrice: number; distributorMarginPercent: number }>;
    }>(await api(`/api/v1/orders/${placed.id}`, dealerSession));
    assert("historical dealer unchanged", historical.items[0]?.dealerPrice === 120);
    assert("historical dist unchanged", historical.items[0]?.distributorPrice === 100);
    assert("historical margin unchanged", historical.items[0]?.distributorMarginPercent === 20);
    assert("historical total unchanged", historical.totalValue === 120);

    const liveQuote = await json<{ dealerPrice: number; distributorPrice: number }>(
      await api("/api/v1/catalog/price-quote", dealerSession, {
        method: "POST",
        body: JSON.stringify({ productId: productA, quantity: 1 }),
      }),
    );
    assert("live quote uses new dealer 180", liveQuote.dealerPrice === 180);
    assert("live dist uses new 10% margin", liveQuote.distributorPrice === calculateDistributorPrice(180, 10));

    const ym = new Date().toISOString().slice(0, 7);
    const reportRes = await api(
      `/api/v1/admin/reports/drilldown?page=1&pageSize=50&from=${ym}&to=${ym}`,
      adminSession,
    );
    assert("admin drilldown loads", reportRes.ok);
    const reports = await json<{
      items: Array<{ orderId: string; dealerPrice: number; distributorPrice: number }>;
    }>(reportRes);
    const reportRow = reports.items.find((row) => row.orderId === placed.id);
    if (reportRow) {
      assert("admin drilldown dealer snapshot", reportRow.dealerPrice === 120);
      assert("admin drilldown dist snapshot", reportRow.distributorPrice === 100);
    }
  } finally {
    await api("/api/v1/admin/pricing-tiers/tier-t1", adminSession, {
      method: "PATCH",
      body: JSON.stringify({ code: "T1", name: "Tier 1", distributorMarginPercent: origMargin }),
    });
    for (const row of origPrices.results) {
      await db
        .prepare(
          `INSERT INTO pricing_tier_product_prices (tier_id, product_id, dealer_price)
           VALUES ('tier-t1', ?, ?)
           ON CONFLICT(tier_id, product_id) DO UPDATE SET dealer_price = excluded.dealer_price`,
        )
        .bind(row.product_id, row.dealer_price)
        .run();
    }
    if (origDealerTier?.t && dealerUser.dealerId) {
      await db
        .prepare(`UPDATE dealers SET pricing_tier_id = ? WHERE id = ?`)
        .bind(origDealerTier.t, dealerUser.dealerId)
        .run();
    }
    if (t2Id && t2Id !== "tier-t1") {
      await api(`/api/v1/admin/pricing-tiers/${t2Id}`, adminSession, { method: "DELETE" });
    }
  }

  console.log("\nAll pricing-tier checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
