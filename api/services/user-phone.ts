/** Release a phone for reuse while keeping soft-deleted rows (users.phone is UNIQUE). */
export function tombstonePhone(phone: string, userId: string) {
  return `${phone}#deleted#${userId}`;
}

export function deletedPhoneLikePattern(phone: string) {
  return `${phone}#deleted#%`;
}

export function stripPhoneTombstone(phone: string) {
  const marker = "#deleted#";
  const idx = phone.indexOf(marker);
  return idx >= 0 ? phone.slice(0, idx) : phone;
}

export async function findActiveUserByPhone(db: D1Database, phone: string) {
  return db
    .prepare(`SELECT id, status FROM users WHERE phone = ? AND deleted_at IS NULL`)
    .bind(phone)
    .first<{ id: string; status: string }>();
}

export async function findDeletedUserIdByPhone(db: D1Database, phone: string) {
  const row = await db
    .prepare(
      `SELECT id FROM users
       WHERE deleted_at IS NOT NULL AND (phone = ? OR phone LIKE ?)`,
    )
    .bind(phone, deletedPhoneLikePattern(phone))
    .first<{ id: string }>();
  return row?.id ?? null;
}

export async function isPhoneTakenByActiveUser(
  db: D1Database,
  phone: string,
  excludeUserId?: string,
) {
  const row = await db
    .prepare(
      `SELECT id FROM users WHERE phone = ? AND deleted_at IS NULL${excludeUserId ? " AND id != ?" : ""}`,
    )
    .bind(...(excludeUserId ? [phone, excludeUserId] : [phone]))
    .first();
  return Boolean(row);
}
