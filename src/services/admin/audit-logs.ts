import { adminStore } from "@/lib/mock/admin/store";
import type { AuditLogEntry, ListFilters, PaginatedResult } from "@/lib/mock/admin/types";
import { delay, matchesQuery, paginate } from "./_utils";

export async function listAuditLogs(filters: ListFilters = {}): Promise<PaginatedResult<AuditLogEntry>> {
  await delay();
  let items = [...adminStore.auditLogs];
  if (filters.search) {
    items = items.filter((e) =>
      matchesQuery(filters.search, e.actorName, e.action, e.entityType, e.entityId, e.summary),
    );
  }
  return paginate(items, filters);
}
