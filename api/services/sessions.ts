import type { D1Database } from "@cloudflare/workers-types";
import { buildSessionUser, resolveEffectiveRole } from "../rbac";
import type { AppVariables } from "../types";
import { id, SESSION_DAYS, sha256 } from "../utils";

export async function createSessionForUserRow(
  db: D1Database,
  userRow: Record<string, unknown>,
  meta: { ip: string | null; userAgent: string | null },
) {
  const sessionId = id("sess");
  const tokenHash = await sha256(sessionId);
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      sessionId,
      userRow["id"],
      tokenHash,
      expires,
      meta.ip,
      meta.userAgent,
    )
    .run();

  const effectiveRole = await resolveEffectiveRole(
    db,
    userRow["id"] as string,
    userRow["role"] as AppVariables["user"]["role"],
  );
  const user = buildSessionUser({
    id: userRow["id"] as string,
    name: userRow["name"] as string,
    phone: userRow["phone"] as string,
    role: effectiveRole,
    status: userRow["status"] as AppVariables["user"]["status"],
    dealer_id: userRow["dealer_id"] as string | null,
    distributor_id: userRow["distributor_id"] as string | null,
  });

  return { user, sessionId };
}
