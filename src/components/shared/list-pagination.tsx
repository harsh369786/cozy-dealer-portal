import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function ListPagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="mt-6 flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className={cn(
          "press flex h-11 items-center gap-1 rounded-2xl border border-border bg-card px-4 text-sm font-bold",
          page <= 1 && "pointer-events-none opacity-50",
        )}
      >
        <ChevronLeft className="h-4 w-4" />
        Prev
      </button>
      <p className="text-sm font-semibold text-muted-foreground">
        Page {page} of {totalPages}
      </p>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className={cn(
          "press flex h-11 items-center gap-1 rounded-2xl border border-border bg-card px-4 text-sm font-bold",
          page >= totalPages && "pointer-events-none opacity-50",
        )}
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
