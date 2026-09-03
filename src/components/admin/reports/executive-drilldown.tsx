import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { getReportDrilldown, inrFull, fmtNum, fmtSqft, type DrilldownRow } from "@/services/admin/executive-reports";
import type { DrillContext } from "./executive-types";

export function ExecutiveDrilldown({
  context,
  onClose,
}: {
  context: DrillContext | null;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [items, setItems] = useState<DrilldownRow[]>([]);

  useEffect(() => {
    setPage(1);
  }, [context]);

  useEffect(() => {
    if (!context) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getReportDrilldown({ ...context.filters, page, pageSize: 20 })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
        setTotalPages(res.totalPages);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load order lines");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [context, page]);

  return (
    <Dialog open={Boolean(context)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-5xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="pr-8">{context?.title ?? "Order details"}</DialogTitle>
          <p className="text-sm text-muted-foreground">{total.toLocaleString("en-IN")} line items from the selected metric</p>
        </DialogHeader>
        {loading && items.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="shimmer-line h-16 rounded-xl bg-muted" />
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={() => setPage((p) => p)} />
        ) : items.length === 0 ? (
          <EmptyState title="No matching orders" description="This visual has no underlying order lines in the current filters." />
        ) : (
          <div className="-mx-2 min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-2">Order</th>
                  <th className="px-2 py-2">Date/Time</th>
                  <th className="px-2 py-2">Dealer</th>
                  <th className="px-2 py-2">Distributor</th>
                  <th className="px-2 py-2">Sales Exec</th>
                  <th className="px-2 py-2">Product</th>
                  <th className="px-2 py-2">Category</th>
                  <th className="px-2 py-2">Size</th>
                  <th className="px-2 py-2">Thk</th>
                  <th className="px-2 py-2 text-right">Qty</th>
                  <th className="px-2 py-2 text-right">Sq.ft</th>
                  <th className="px-2 py-2 text-right">MRP</th>
                  <th className="px-2 py-2 text-right">Dealer</th>
                  <th className="px-2 py-2 text-right">Dist %</th>
                  <th className="px-2 py-2 text-right">Dist price</th>
                  <th className="px-2 py-2 text-right">Disc %</th>
                  <th className="px-2 py-2 text-right">Final</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Campaign</th>
                  <th className="px-2 py-2 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row, i) => (
                  <tr key={`${row.orderId}-${i}`} className="border-b border-border/70">
                    <td className="px-2 py-2">
                      <Link to="/admin/orders/$orderId" params={{ orderId: row.orderId }} className="font-semibold text-primary underline">
                        {row.orderId}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">{row.placedAt}</td>
                    <td className="max-w-[140px] truncate px-2 py-2">{row.dealerName}</td>
                    <td className="max-w-[140px] truncate px-2 py-2">{row.distributorName}</td>
                    <td className="max-w-[120px] truncate px-2 py-2">{row.salesExecutiveName}</td>
                    <td className="max-w-[160px] truncate px-2 py-2" title={row.product}>
                      {row.product}
                    </td>
                    <td className="px-2 py-2">{row.category || "—"}</td>
                    <td className="whitespace-nowrap px-2 py-2">{row.size}</td>
                    <td className="px-2 py-2">{row.thickness || "—"}</td>
                    <td className="px-2 py-2 text-right">{fmtNum(row.quantity)}</td>
                    <td className="px-2 py-2 text-right">{fmtSqft(row.sqft)}</td>
                    <td className="px-2 py-2 text-right">{inrFull(row.mrp)}</td>
                    <td className="px-2 py-2 text-right">{inrFull(row.dealerPrice)}</td>
                    <td className="px-2 py-2 text-right">{row.distributorMarginPercent.toFixed(1)}</td>
                    <td className="px-2 py-2 text-right">{inrFull(row.distributorPrice)}</td>
                    <td className="px-2 py-2 text-right">{row.discountPercent.toFixed(1)}</td>
                    <td className="px-2 py-2 text-right font-semibold">{inrFull(row.finalPrice)}</td>
                    <td className="px-2 py-2 capitalize">{row.status.replaceAll("_", " ")}</td>
                    <td className="max-w-[120px] truncate px-2 py-2">{row.campaignName || "—"}</td>
                    <td className="px-2 py-2 text-right">{fmtNum(row.pointsEarned)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex shrink-0 items-center justify-between gap-2">
            <Button variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <p className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <Button variant="outline" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
