let kindColumn: boolean | undefined;

export const REWARD_KIND_STANDARD = "standard";
export const REWARD_KIND_MILESTONE = "milestone";

export type RewardKind = typeof REWARD_KIND_STANDARD | typeof REWARD_KIND_MILESTONE;

export function normalizeRewardKind(value: unknown): RewardKind {
  return value === REWARD_KIND_MILESTONE ? REWARD_KIND_MILESTONE : REWARD_KIND_STANDARD;
}

/** True after migration 0027 (reward_catalog.kind). */
export async function hasRewardKindColumn(db: D1Database): Promise<boolean> {
  if (kindColumn !== undefined) return kindColumn;
  const row = await db
    .prepare(`SELECT 1 AS ok FROM pragma_table_info('reward_catalog') WHERE name = 'kind' LIMIT 1`)
    .first<{ ok: number }>();
  kindColumn = Boolean(row);
  return kindColumn;
}

export function standardCatalogSqlFilter(hasKind: boolean, alias = ""): string {
  if (!hasKind) return "";
  const col = alias ? `${alias}.kind` : "kind";
  return `AND COALESCE(${col}, '${REWARD_KIND_STANDARD}') = '${REWARD_KIND_STANDARD}'`;
}

export function milestoneCatalogSqlFilter(hasKind: boolean, alias = ""): string {
  if (!hasKind) return "AND 1 = 0";
  const col = alias ? `${alias}.kind` : "kind";
  return `AND COALESCE(${col}, '${REWARD_KIND_STANDARD}') = '${REWARD_KIND_MILESTONE}'`;
}
