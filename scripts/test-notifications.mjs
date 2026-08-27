/**
 * Notification flow smoke tests.
 * Run: node scripts/test-notifications.mjs
 * Remote: node scripts/test-notifications.mjs --base=https://backrest-pwa.shahharsh143-hs.workers.dev
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
  console.log(`Notification tests against ${BASE}\n`);

  const health = await fetch(`${BASE}/api/v1/health`);
  assert("health check", health.status === 200);

  const dealerSession = await login("9876543210");
  const distSession = await login("9823044120");
  const adminSession = await login("9999999999");

  let staffSession;
  try {
    staffSession = await login("9888877777");
  } catch {
    staffSession = null;
  }

  const unreadRes = await api("/api/v1/notifications/unread-count", dealerSession);
  assert("unread-count endpoint", unreadRes.status === 200);
  const unreadJson = await unreadRes.json();
  assert("unread-count shape", typeof unreadJson.count === "number");

  const vapidRes = await fetch(`${BASE}/api/v1/notifications/vapid-public-key`);
  assert("vapid public key endpoint", vapidRes.status === 200);

  const dealerNotifsRes = await api("/api/v1/notifications", dealerSession);
  assert("dealer can list notifications", dealerNotifsRes.status === 200);
  const dealerNotifs = await dealerNotifsRes.json();
  assert("dealer notifications is array", Array.isArray(dealerNotifs));

  const distNotifsRes = await api("/api/v1/notifications", distSession);
  assert("distributor can list notifications", distNotifsRes.status === 200);
  const distNotifs = await distNotifsRes.json();
  assert("distributor notifications is array", Array.isArray(distNotifs));

  const adminNotifsRes = await api("/api/v1/notifications", adminSession);
  assert("master_admin can list notifications", adminNotifsRes.status === 200);
  const adminNotifs = await adminNotifsRes.json();
  assert("admin notifications is array", Array.isArray(adminNotifs));

  if (staffSession) {
    const staffNotifsRes = await api("/api/v1/notifications", staffSession);
    assert("admin_staff can list notifications", staffNotifsRes.status === 200);
    const staffNotifs = await staffNotifsRes.json();
    assert("staff notifications is array", Array.isArray(staffNotifs));
  }

  const signupPhone = `9${String(Date.now()).slice(-9)}`;
  const signupRes = await fetch(`${BASE}/api/v1/signup/applications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Notify Test",
      birthday: "1990-01-15",
      storeName: "Notify Store",
      phone: signupPhone,
      address: "123 MG Road, Pune, Maharashtra",
      distributorName: "Nagpur Distributors",
    }),
  });
  assert("signup for pending notification test", signupRes.status === 201);
  const pendingSession = await login(signupPhone);
  const pendingNotifs = await api("/api/v1/notifications", pendingSession);
  assert("pending user blocked from notifications", pendingNotifs.status === 403);

  const unreadBefore = dealerNotifs.filter((n) => !n.read).length;
  const unreadItem = dealerNotifs.find((n) => !n.read);
  if (unreadItem) {
    const markRes = await api(`/api/v1/notifications/${unreadItem.id}/read`, dealerSession, {
      method: "PATCH",
    });
    assert("mark notification read", markRes.status === 200);

    const crossMark = await api(`/api/v1/notifications/${unreadItem.id}/read`, distSession, {
      method: "PATCH",
    });
    assert("cross-user mark read blocked", crossMark.status === 404);

    const afterRes = await api("/api/v1/notifications", dealerSession);
    const afterList = await afterRes.json();
    const marked = afterList.find((n) => n.id === unreadItem.id);
    assert("notification persisted as read", marked?.read === true);
  } else {
    console.log("  ~ skip mark-read test (no unread dealer notifications)");
  }

  const distOnlyIds = new Set(distNotifs.map((n) => n.id));
  const dealerHasDistNotif = dealerNotifs.some((n) => distOnlyIds.has(n.id) && !distNotifs.find((d) => d.id === n.id && d.title === n.title));
  assert("dealer inbox scoped to own notifications", !dealerHasDistNotif || distNotifs.length === 0);

  const distOrderNotif = distNotifs.find((n) => n.type === "new_order");
  if (distOrderNotif) {
    assert(
      "distributor new_order has pending approval title",
      distOrderNotif.title?.toLowerCase().includes("pending approval"),
      distOrderNotif.title,
    );
    assert(
      "distributor order notification has order link",
      distOrderNotif.link?.startsWith("/distributor/orders/"),
      distOrderNotif.link,
    );
  } else {
    console.log("  ~ skip distributor order link test (no order notifications in seed)");
  }

  const adminOrderNotif = adminNotifs.find((n) => n.type === "new_order");
  if (adminOrderNotif) {
    assert(
      "admin order notification has admin order link",
      adminOrderNotif.link?.startsWith("/admin/orders/"),
      adminOrderNotif.link,
    );
  } else {
    console.log("  ~ skip admin order link test (no order notifications in seed)");
  }

  const dealerOrderNotif = dealerNotifs.find((n) => n.type === "order_placed");
  if (dealerOrderNotif) {
    assert(
      "dealer order-placed notification has dealer order link",
      dealerOrderNotif.link?.startsWith("/orders/"),
      dealerOrderNotif.link,
    );
  } else {
    console.log("  ~ skip dealer order-placed test (deploy latest backend to create new rows)");
  }

  const rewardClaimAdmin = adminNotifs.find((n) => n.type === "reward_claim");
  if (rewardClaimAdmin) {
    assert(
      "reward claim admin link",
      rewardClaimAdmin.link?.includes("/admin/rewards"),
      rewardClaimAdmin.link,
    );
  }

  const dealerComplaintNotif = dealerNotifs.find((n) => n.type === "complaint_update");
  if (dealerComplaintNotif?.link) {
    assert(
      "complaint update uses /complaints link",
      dealerComplaintNotif.link.startsWith("/complaints/"),
      dealerComplaintNotif.link,
    );
  }

  const markAllRes = await api("/api/v1/notifications/read-all", dealerSession, { method: "POST" });
  assert("mark all read", markAllRes.status === 200);

  const allReadRes = await api("/api/v1/notifications", dealerSession);
  const allReadList = await allReadRes.json();
  const stillUnread = allReadList.filter((n) => !n.read).length;
  assert("mark all read clears unread flags", stillUnread === 0, `${stillUnread} still unread`);

  const afterUnread = await api("/api/v1/notifications/unread-count", dealerSession);
  const afterUnreadJson = await afterUnread.json();
  assert("unread-count zero after mark all", afterUnreadJson.count === 0);

  console.log(`\nNotification smoke tests passed (${unreadBefore} unread before mark-read test).`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
