import type { ListFilters, PaginatedResult } from "@/lib/mock/admin/types";

export const MOCK_DELAY_MS = 0;

export function delay(ms = MOCK_DELAY_MS) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function paginate<T>(
  items: T[],
  filters: ListFilters = {},
): PaginatedResult<T> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? 10;
  const start = (page - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  const total = items.length;
  return {
    items: slice,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function matchesQuery(query: string | undefined, ...fields: (string | undefined)[]) {
  const q = query?.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f?.toLowerCase().includes(q));
}
