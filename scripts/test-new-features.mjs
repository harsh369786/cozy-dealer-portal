/**
 * Smoke tests for newly added admin features.
 * Run: node scripts/test-new-features.mjs --base=https://backrest-pwa.shahharsh143-hs.workers.dev
 */
const baseArg = process.argv.find((a) => a.startsWith("--base="));
const BASE = baseArg?.slice("--base=".length) ?? "http://localhost:8080";
const OTP = "123456";

async function login(phone) {
  await fetch(`${BASE}/api/v1/auth/otp/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  const res = await fetch(`${BASE}/api/v1/auth/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code: OTP }),
  });
  const match = (res.headers.get("set-cookie") ?? "").match(/backrest_session=([^;]+)/);
  if (!match) throw new Error(`Login failed for ${phone}`);
  return match[1];
}

async function api(path, session, init = {}) {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      cookie: `backrest_session=${session}`,
      ...(init.headers ?? {}),
    },
  });
}

function assert(name, condition, detail) {
  if (!condition) throw new Error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log(`Testing new features against ${BASE}\n`);

  const admin = await login("9999999999");
  const dealer = await login("9876543210");
  const dist = await login("9823044120");
  const se = await login("9777766666");

  const analytics = await api("/api/v1/admin/analytics?month=Aug&fromMonth=Mar&toMonth=Aug", admin);
  const analyticsData = await analytics.json();
  assert("admin analytics returns KPIs", analytics.status === 200 && analyticsData.kpis?.length >= 4);

  const explore = await api("/api/v1/admin/explore?level=distributors", admin);
  const exploreData = await explore.json();
  assert("admin explore distributors", explore.status === 200 && Array.isArray(exploreData.items));

  const exploreDealers = await api("/api/v1/admin/explore?level=dealers&distributorId=dist-nagpur-01", admin);
  assert("admin explore dealers", exploreDealers.status === 200);

  const rewards = await api("/api/v1/admin/rewards", admin);
  const rewardsData = await rewards.json();
  assert("admin rewards catalog", rewards.status === 200 && Array.isArray(rewardsData.items));

  const claims = await api("/api/v1/admin/reward-claims", admin);
  const claimsData = await claims.json();
  assert("admin reward claims", claims.status === 200 && Array.isArray(claimsData.items));

  const catalog = await api("/api/v1/rewards/catalog", dealer);
  assert("dealer rewards catalog from API", catalog.status === 200);

  const perfWeek = await api("/api/v1/reports/dealer-performance?period=week", dist);
  const perfWeekData = await perfWeek.json();
  assert("distributor weekly performance", perfWeek.status === 200 && Array.isArray(perfWeekData.dealers));

  const perfQuarter = await api("/api/v1/reports/dealer-performance?period=quarter", se);
  assert("SE quarterly performance", perfQuarter.status === 200);

  const sysNotif = await api("/api/v1/admin/system-notifications", admin);
  assert("admin system notifications", sysNotif.status === 200);

  const ordersRes = await api("/api/v1/orders?pageSize=1", admin);
  const ordersData = await ordersRes.json();
  const orderId = ordersData.items?.[0]?.id;
  assert("admin can fetch orders", !!orderId, "no orders in DB");

  const statusOpts = await api(`/api/v1/orders/${orderId}/status-options`, admin);
  const opts = await statusOpts.json();
  assert(
    "master_admin status options (bidirectional)",
    statusOpts.status === 200 && Array.isArray(opts.allowed) && opts.allowed.includes("order_placed"),
    JSON.stringify(opts),
  );

  console.log("\nNew feature smoke tests passed.");
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
