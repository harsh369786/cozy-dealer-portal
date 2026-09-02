import type { SessionUser } from "../types";

export type DistributorProfile = {
  id: string;
  name: string;
  region: string | null;
  phone: string | null;
};

export async function getDistributorProfile(
  db: D1Database,
  distributorId: string,
): Promise<DistributorProfile | null> {
  const row = await db
    .prepare(
      `SELECT id, name, region, phone FROM distributors WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(distributorId)
    .first<{ id: string; name: string; region: string | null; phone: string | null }>();
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    region: row.region,
    phone: row.phone,
  };
}

export async function getProfileForUser(
  db: D1Database,
  user: SessionUser,
): Promise<{ user: SessionUser; distributor: DistributorProfile | null }> {
  const distributor =
    user.distributorId != null
      ? await getDistributorProfile(db, user.distributorId)
      : null;
  return { user, distributor };
}
