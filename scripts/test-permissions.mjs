/**
 * RBAC permission smoke tests.
 * Run: node scripts/test-permissions.mjs
 * Remote: node scripts/test-permissions.mjs --base=https://backrest-pwa.shahharsh143-hs.workers.dev
 * Local requires: npm run dev on port 8080
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
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/backrest_session=([^;]+)/);
  if (!match) throw new Error(`Login failed for ${phone}: ${res.status}`);
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
  console.log(`Testing against ${BASE}\n`);

  const health = await fetch(`${BASE}/api/v1/health`);
  assert("health check", health.status === 200);

  const dealerSession = await login("9876543210");
  const distSession = await login("9823044120");
  const adminSession = await login("9999999999");

  let staffSession;
  try {
    staffSession = await login("9888877777");
  } catch {
    console.log("  ~ skip admin_staff tests (user not seeded — run db:seed:remote)");
    staffSession = null;
  }

  let seSession;
  try {
    seSession = await login("9777766666");
  } catch {
    console.log("  ~ skip sales_executive tests (user not seeded)");
    seSession = null;
  }

  const allOrders = await api("/api/v1/orders", dealerSession);
  const orders = await allOrders.json();
  assert("dealer can list orders", allOrders.status === 200 && Array.isArray(orders));

  if (staffSession) {
    const staffReports = await api("/api/v1/reports/monthly-sales", staffSession);
    assert("admin_staff cannot access reports", staffReports.status === 403);
  }

  if (seSession) {
    const seComplaints = await api("/api/v1/complaints", seSession);
    assert("SE complaints endpoint ok", seComplaints.status === 200);
    const seReports = await api("/api/v1/reports/product-sales", seSession);
    assert("SE can access scoped product-sales", seReports.status === 200);
  }

  const orderId = orders[0]?.id;
  if (orderId) {
    const distDeliver = await api(`/api/v1/orders/${orderId}/status`, distSession, {
      method: "PATCH",
      body: JSON.stringify({ status: "delivered" }),
    });
    assert("distributor cannot set delivered", distDeliver.status === 403 || distDeliver.status === 400);
  }

  const distCancel = await api(`/api/v1/orders/${orderId ?? "BR-00001"}/cancel`, distSession, {
    method: "POST",
    body: JSON.stringify({}),
  });
  assert("distributor cannot cancel orders", distCancel.status === 403);

  const adminAssignments = await api("/api/v1/admin/assignments", adminSession);
  assert("master_admin can list assignments", adminAssignments.status === 200);

  const adminUsers = await api("/api/v1/admin/users", adminSession);
  assert("master_admin can list users", adminUsers.status === 200);

  const adminProducts = await api("/api/v1/admin/products", adminSession);
  assert("master_admin can list products", adminProducts.status === 200);

  const adminCampaigns = await api("/api/v1/admin/campaigns", adminSession);
  assert("master_admin can list campaigns", adminCampaigns.status === 200);

  if (staffSession) {
    const staffAssignments = await api("/api/v1/admin/assignments", staffSession);
    assert("admin_staff cannot list assignments", staffAssignments.status === 403);
  }

  const distDealers = await api("/api/v1/dealers", distSession);
  const distDealerList = await distDealers.json();
  assert("distributor dealers scoped", distDealers.status === 200 && Array.isArray(distDealerList));
  assert(
    "distributor sees only own org dealers",
    distDealerList.every((d) => d.distributorId === "dist-nagpur-01"),
    `got ${distDealerList.length} dealers`,
  );

  if (seSession) {
    const seDealers = await api("/api/v1/dealers", seSession);
    const seDealerList = await seDealers.json();
    assert("SE dealers scoped", seDealers.status === 200 && Array.isArray(seDealerList));
    assert(
      "SE sees only assigned dealers",
      seDealerList.length >= 1 && seDealerList.every((d) => ["dlr-sharma", "dlr-patil"].includes(d.id)),
      `got ids: ${seDealerList.map((d) => d.id).join(",")}`,
    );
  }

  console.log("\nPermission smoke tests passed.");
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
