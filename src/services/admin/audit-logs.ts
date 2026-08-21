import type { AuditLogEntry, ListFilters, PaginatedResult } from "@/lib/mock/admin/types";
import { api } from "@/lib/api-client";
import { matchesQuery, paginate } from "./_utils";

type AuditRow = {
  id: string;
  created_at: string;
  actor_name?: string;
  actor_role?: string;
  action: string;
  entity_type: string;
  entity_id: string;
  summary?: string;
};

function mapAuditRow(row: AuditRow): AuditLogEntry {
  return {
    id: row.id,
    timestamp: row.created_at,
    actorName: row.actor_name ?? "System",
    actorRole: (row.actor_role ?? "master_admin") as AuditLogEntry["actorRole"],
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    summary: row.summary ?? row.action,
  };
}

export async function listAuditLogs(filters: ListFilters = {}): Promise<PaginatedResult<AuditLogEntry>> {
  const rows = await api.get<AuditRow[]>("/api/v1/admin/audit-logs");
  let items = rows.map(mapAuditRow);
  if (filters.search) {
    items = items.filter((e) =>
      matchesQuery(filters.search, e.actorName, e.action, e.entityType, e.entityId, e.summary),
    );
  }
  return paginate(items, filters);
}
