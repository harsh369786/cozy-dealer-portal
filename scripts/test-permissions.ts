/**
 * RBAC permission smoke tests against the local API handler.
 * Run: node --experimental-strip-types scripts/test-permissions.ts
 */
import { handleApiRequest } from "../api/app.ts";
import { createDevDatabase } from "../api/db/sqlite-d1.ts";

const BASE = "http://localhost";
const OTP = "123456";

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

async function api(
  path: string,
  session: string,
  init: RequestInit = {},
): Promise<Response> {
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

async function ensureTestUsers(db: D1Database) {
  const upsert = async (id: string, phone: string, name: string, role: string) => {
    const existing = await db.prepare(`SELECT id FROM users WHERE phone = ?`).bind(phone).first();
    if (existing) return;
    await db
      .prepare(`INSERT INTO users (id, phone, name, role, status) VALUES (?, ?, ?, ?, 'active')`)
      .bind(id, phone, name, role)
      .run();
  };
  await upsert("user-admin-staff", "+919888877777", "Priya Operations", "admin_staff");
  await upsert("user-sales-exec", "+919777766666", "Amit Sales", "sales_executive");

  const seDealers = await db
    .prepare(`SELECT id FROM dealers WHERE deleted_at IS NULL LIMIT 2`)
    .all<{ id: string }>();
  for (const d of seDealers.results) {
    const exists = await db
      .prepare(
        `SELECT id FROM dealer_assignments WHERE dealer_id = ? AND assignee_user_id = 'user-sales-exec'`,
      )
      .bind(d.id)
      .first();
    if (!exists) {
      await db
        .prepare(
          `INSERT INTO dealer_assignments (id, dealer_id, assignee_user_id, assignee_role) VALUES (?, ?, ?, ?)`,
        )
        .bind(`asgn-${d.id}-se-test`, d.id, "user-sales-exec", "sales_executive")
        .run();
    }
  }
}

function assert(name: string, condition: boolean, detail?: string) {
  if (!condition) throw new Error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`  ✓ ${name}`);
}

async function main() {
  const db = await createDevDatabase();
  await ensureTestUsers(db);

  const dealerSession = await login("9876543210");
  const distSession = await login("9823044120");
  const adminSession = await login("9999999999");
  const staffSession = await login("9888877777");
  const seSession = await login("9777766666");

  const allOrders = await api("/api/v1/orders", dealerSession);
  const orders = (await allOrders.json()) as Array<{ id: string }>;
  const ownOrderId = orders[0]?.id;
  assert("dealer has orders", Boolean(ownOrderId));

  const otherOrderId =
    (await db.prepare(`SELECT id FROM orders WHERE dealer_id != 'dlr-sharma' LIMIT 1`).first<{ id: string }>())
      ?.id ?? "BR-OTHER";
  if (otherOrderId !== "BR-OTHER") {
    const forbidden = await api(`/api/v1/orders/${otherOrderId}`, dealerSession);
    assert("dealer cannot access other order", forbidden.status === 403);
  }

  const seComplaints = await api("/api/v1/complaints", seSession);
  const seComplaintPayload = (await seComplaints.json()) as
    | Array<{ dealerId: string }>
    | { items: Array<{ dealerId: string }> };
  const seComplaintList = Array.isArray(seComplaintPayload)
    ? seComplaintPayload
    : (seComplaintPayload.items ?? []);
  const seScope = await db
    .prepare(`SELECT id FROM dealers WHERE sales_executive_user_id = 'user-sales-exec' AND deleted_at IS NULL`)
    .all<{ id: string }>();
  const seDealerIds = new Set(seScope.results.map((r) => r.id));
  assert(
    "SE complaints scoped to assignments",
    seComplaintList.every((c) => seDealerIds.has(c.dealerId)),
  );

  if (ownOrderId) {
    const distOrders = await api("/api/v1/orders", distSession);
    const distOrdersPayload = (await distOrders.json()) as
      | Array<{ id: string; status: string }>
      | { items: Array<{ id: string; status: string }> };
    const distOrderList = Array.isArray(distOrdersPayload)
      ? distOrdersPayload
      : (distOrdersPayload.items ?? []);
    const deliverableOrder = distOrderList.find((o) => o.status === "out_for_delivery");

    if (deliverableOrder?.id) {
      const distDeliver = await api(`/api/v1/orders/${deliverableOrder.id}/status`, distSession, {
        method: "PATCH",
        body: JSON.stringify({ status: "delivered" }),
      });
      assert("distributor can set delivered", distDeliver.status === 200);
    }

    const distMaking = await api(`/api/v1/orders/${ownOrderId}/status`, distSession, {
      method: "PATCH",
      body: JSON.stringify({ status: "in_making" }),
    });
    assert("distributor cannot set in_making", distMaking.status === 403 || distMaking.status >= 400);
  }

  const staffPatchComplaint = await db
    .prepare(`SELECT id FROM complaints WHERE deleted_at IS NULL LIMIT 1`)
    .first<{ id: string }>();
  if (staffPatchComplaint) {
    const patch = await api(`/api/v1/complaints/${staffPatchComplaint.id}`, staffSession, {
      method: "PATCH",
      body: JSON.stringify({ status: "in_progress" }),
    });
    assert("admin_staff can patch complaints", patch.status === 200);
  }

  const staffReports = await api("/api/v1/reports/monthly-sales", staffSession);
  assert("admin_staff cannot access reports", staffReports.status === 403);

  const staffVisitSummary = await api("/api/v1/reports/visit-summary", staffSession);
  assert("admin_staff cannot access unscoped visit summary", staffVisitSummary.status === 403);

  const seReports = await api("/api/v1/reports/product-sales", seSession);
  assert("SE can access scoped product-sales", seReports.status === 200);

  const approvedOrder = await db
    .prepare(`SELECT id FROM orders WHERE status = 'approved' LIMIT 1`)
    .first<{ id: string }>();
  if (approvedOrder) {
    const distCancel = await api(`/api/v1/orders/${approvedOrder.id}/cancel`, distSession, {
      method: "POST",
      body: JSON.stringify({}),
    });
    assert("distributor cannot cancel approved order", distCancel.status === 403);

    const adminCancel = await api(`/api/v1/orders/${approvedOrder.id}/cancel`, adminSession, {
      method: "POST",
      body: JSON.stringify({ reason: "Test cancel" }),
    });
    assert("master admin can cancel approved order", adminCancel.status === 200);
  } else {
    console.log("  ~ skip cancel test (no approved order in seed)");
  }

  console.log("\nAll permission checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
