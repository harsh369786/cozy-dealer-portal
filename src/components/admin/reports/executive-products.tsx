import { useState } from "react";
import type { ProductsReport } from "@/services/admin/executive-reports";
import { fmtNum, fmtSqft, inrFull, inrLakh } from "@/services/admin/executive-reports";
import type { DrillContext } from "./executive-types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ExecutiveProductsPage({
  data,
  onDrill,
  onFilterProduct,
}: {
  data: ProductsReport;
  onDrill: (ctx: DrillContext) => void;
  onFilterProduct: (product: string) => void;
}) {
  const [skuOpen, setSkuOpen] = useState(false);
  const top = data.top ?? [];
  const products = data.products ?? [];
  const maxRev = top[0]?.revenue || 1;
  const base = data.filters;

  const openProduct = (name: string) => {
    onFilterProduct(name);
    onDrill({ title: `${name} — order lines`, filters: { ...base, product: name } });
  };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">Product Line Matrix & Category Breakdown</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4 shadow-soft sm:p-5">
          <h3 className="font-display text-base font-bold">Top 6 Revenue Generating Products</h3>
          <div className="mt-4 space-y-4">
            {top.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No product sales in this range.</p>
            ) : (
              top.map((p) => (
                <button key={`${p.id}-${p.name}`} type="button" className="block w-full text-left" onClick={() => openProduct(p.name)}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate font-semibold uppercase">{p.name}</p>
                    <p className="shrink-0 font-bold text-primary">{inrFull(p.revenue)}</p>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (p.revenue / maxRev) * 100)}%` }} />
                  </div>
                  <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                    <span>{p.share.toFixed(1)}% of total</span>
                    <span>{fmtNum(p.pcs)} pcs</span>
                    <span>{fmtSqft(p.sqft)} sq.ft</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4 shadow-soft sm:p-5">
          <h3 className="font-display text-base font-bold">Product Portfolio Economics</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button type="button" className="rounded-xl border border-border p-4 text-left hover:border-primary" onClick={() => setSkuOpen(true)}>
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Active Product SKUs</p>
              <p className="mt-2 font-display text-3xl font-bold">{fmtNum(data.kpis.skuCount)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Mattresses, Pillows & Mats</p>
            </button>
            <button
              type="button"
              className="rounded-xl border border-border p-4 text-left hover:border-primary"
              onClick={() => onDrill({ title: "All product lines — order lines", filters: base })}
            >
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Avg Product Revenue</p>
              <p className="mt-2 font-display text-3xl font-bold text-primary">{inrLakh(data.kpis.avgProductRevenue)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Per product line</p>
            </button>
            <button
              type="button"
              className="rounded-xl border border-border p-4 text-left hover:border-primary"
              onClick={() => onDrill({ title: "Yield — order lines", filters: base })}
            >
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Avg Yield Per Sq.ft</p>
              <p className="mt-2 font-display text-3xl font-bold">{inrFull(data.kpis.yieldPerSqft)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Overall average</p>
            </button>
            <button
              type="button"
              className="rounded-xl border border-border p-4 text-left hover:border-primary"
              onClick={() => onDrill({ title: "Unit size — order lines", filters: base })}
            >
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Avg Unit Size</p>
              <p className="mt-2 font-display text-3xl font-bold">{data.kpis.avgUnitSize.toFixed(1)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Sq.ft per piece</p>
            </button>
          </div>
        </section>
      </div>

      <Dialog open={skuOpen} onOpenChange={setSkuOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Active product SKUs</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {products.map((p) => (
              <button
                key={`${p.id}-${p.name}`}
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left hover:border-primary"
                onClick={() => {
                  setSkuOpen(false);
                  openProduct(p.name);
                }}
              >
                <span className="min-w-0 truncate font-semibold">{p.name}</span>
                <span className="shrink-0 text-sm font-bold text-primary">{inrFull(p.revenue)}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
