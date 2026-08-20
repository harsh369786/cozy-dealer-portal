/** Upsert admin_staff + sales_executive test users (safe on existing DB). */
export async function ensureRbacTestUsers(db: D1Database) {
  const upsertUser = async (id: string, phone: string, name: string, role: string) => {
    const existing = await db.prepare(`SELECT id FROM users WHERE id = ? OR phone = ?`).bind(id, phone).first();
    if (existing) return;
    await db
      .prepare(`INSERT INTO users (id, phone, name, role, status) VALUES (?, ?, ?, ?, 'active')`)
      .bind(id, phone, name, role)
      .run();
  };

  await upsertUser("user-admin-staff", "+919888877777", "Priya Operations", "admin_staff");
  await upsertUser("user-sales-exec", "+919777766666", "Amit Sales", "sales_executive");

  const { results: dealerRows } = await db
    .prepare(`SELECT id FROM dealers WHERE deleted_at IS NULL LIMIT 2`)
    .all<{ id: string }>();

  for (const d of dealerRows) {
    const exists = await db
      .prepare(
        `SELECT id FROM dealer_assignments WHERE dealer_id = ? AND assignee_user_id = 'user-sales-exec' AND assignee_role = 'sales_executive'`,
      )
      .bind(d.id)
      .first();
    if (!exists) {
      await db
        .prepare(
          `INSERT INTO dealer_assignments (id, dealer_id, assignee_user_id, assignee_role) VALUES (?, ?, ?, ?)`,
        )
        .bind(`asgn-${d.id}-se`, d.id, "user-sales-exec", "sales_executive")
        .run();
    }
  }
}
