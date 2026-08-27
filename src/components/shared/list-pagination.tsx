import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
        {t("common.prevPage")}
      </button>
      <p className="text-sm font-semibold text-muted-foreground">
        {t("common.pageOf", { page, total: totalPages })}
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
        {t("common.nextPage")}
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
