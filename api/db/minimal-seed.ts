export async function runMinimalSeed(db: D1Database) {
  const distId = "dist-nagpur-01";
  const dealerId = "dlr-sharma";

  await db
    .prepare(`INSERT OR IGNORE INTO distributors (id, name, region, phone) VALUES (?, ?, ?, ?)`)
    .bind(distId, "Vikram Mehta", "Maharashtra Central", "+91 98230 44120")
    .run();

  await db
    .prepare(
      `INSERT OR IGNORE INTO dealers (id, distributor_id, code, store_name, location, phone, email, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    )
    .bind(
      dealerId,
      distId,
      "BR-NGP-014",
      "Sharma Furnishings",
      "Sitabuldi, Nagpur",
      "+91 98765 43210",
      "rajesh@sharmafurnishings.in",
    )
    .run();

  await db
    .prepare(
      `INSERT OR IGNORE INTO users (id, phone, name, role, dealer_id, distributor_id) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind("user-dealer-sharma", "+919876543210", "Rajesh Sharma", "dealer", dealerId, null)
    .run();

  await db
    .prepare(
      `INSERT OR IGNORE INTO users (id, phone, name, role, dealer_id, distributor_id) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind("user-dist-vikram", "+919823044120", "Vikram Mehta", "distributor", null, distId)
    .run();

  await db
    .prepare(`INSERT OR IGNORE INTO users (id, phone, name, role) VALUES (?, ?, ?, ?)`)
    .bind("user-admin", "+919999999999", "BackRest Admin", "master_admin")
    .run();
}
