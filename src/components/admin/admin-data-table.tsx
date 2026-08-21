import type { ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/states";
import { cn } from "@/lib/utils";

export type AdminColumn<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  hideOnMobile?: boolean;
};

export function AdminDataTable<T>({
  columns,
  data,
  keyFn,
  onRowClick,
  emptyTitle = "No results",
  emptyDescription,
  selection,
}: {
  columns: AdminColumn<T>[];
  data: T[];
  keyFn: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  selection?: {
    selectedIds: Set<string>;
    onToggle: (id: string, checked: boolean) => void;
    onToggleAll: (checked: boolean) => void;
  };
}) {
  const allSelected = selection && data.length > 0 && data.every((row) => selection.selectedIds.has(keyFn(row)));
  const someSelected = selection && data.some((row) => selection.selectedIds.has(keyFn(row)));

  if (data.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/50 hover:bg-secondary/50">
              {selection && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={(v) => selection.onToggleAll(v === true)}
                    aria-label="Select all"
                  />
                </TableHead>
              )}
              {columns.map((col) => (
                <TableHead key={col.key} className={cn("font-bold", col.className)}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow
                key={keyFn(row)}
                className={cn(onRowClick && "cursor-pointer")}
                onClick={() => onRowClick?.(row)}
              >
                {selection && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selection.selectedIds.has(keyFn(row))}
                      onCheckedChange={(v) => selection.onToggle(keyFn(row), v === true)}
                      aria-label="Select row"
                    />
                  </TableCell>
                )}
                {columns.map((col) => (
                  <TableCell key={col.key} className={col.className}>
                    {col.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2 md:hidden">
        {data.map((row) => (
          <button
            key={keyFn(row)}
            type="button"
            onClick={() => onRowClick?.(row)}
            className="w-full rounded-xl border border-border bg-card p-4 text-left shadow-soft"
          >
            {selection && (
              <div
                className="mb-2 flex items-center gap-2"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <Checkbox
                  checked={selection.selectedIds.has(keyFn(row))}
                  onCheckedChange={(v) => selection.onToggle(keyFn(row), v === true)}
                  aria-label="Select row"
                />
                <span className="text-xs font-semibold text-muted-foreground">Select</span>
              </div>
            )}
            {columns
              .filter((c) => !c.hideOnMobile)
              .map((col) => (
                <div key={col.key} className="flex items-start justify-between gap-2 py-1 text-sm">
                  <span className="text-muted-foreground">{col.header}</span>
                  <span className="text-right font-semibold">{col.cell(row)}</span>
                </div>
              ))}
          </button>
        ))}
      </div>
    </>
  );
}
