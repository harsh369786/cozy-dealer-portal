import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SnapshotReport, TierBreakdownRow } from "@/services/admin/executive-reports";
import { fmtNum, fmtSqft, inrFull } from "@/services/admin/executive-reports";
import { ExecutiveTrendChart } from "./executive-chart";
import type { DrillContext } from "./executive-types";

export function ExecutiveSnapshotPage({
  data,
  onDrill,
}: {
  data: SnapshotReport;
  onDrill: (ctx: DrillContext) => void;
}) {
  const { kpis, monthly, territories, campaigns, tierBreakdown, peak, filters } = data;
  const base = { ...filters };
  const dealerTiers = tierBreakdown?.dealerTiers ?? [];
  const distributorTiers = tierBreakdown?.distributorTiers ?? [];

  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">Executive Sales Performance Snapshot</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <button
          type="button"
          onClick={() => onDrill({ title: "Gross sales revenue — order lines", filters: base })}
          className="rounded-2xl bg-primary p-5 text-left text-primary-foreground shadow-soft"
        >
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Gross Sales Revenue</p>
          <p className="mt-2 break-words font-display text-2xl font-bold sm:text-3xl">{inrFull(kpis.revenue)}</p>
          <p className="mt-3 inline-flex rounded-full bg-primary-foreground/15 px-2.5 py-1 text-xs font-semibold">
            Avg ticket: {inrFull(kpis.avgTicket)}/pc
          </p>
        </button>
        <button
          type="button"
          onClick={() => onDrill({ title: "Units dispatched — order lines", filters: base })}
          className="rounded-2xl bg-accent p-5 text-left text-accent-foreground shadow-soft"
        >
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Total Units Dispatched</p>
          <p className="mt-2 break-words font-display text-2xl font-bold sm:text-3xl">{fmtNum(kpis.pcs)} PCS</p>
          <p className="mt-3 text-xs font-semibold opacity-80">From {fmtNum(kpis.lines)} confirmed line items</p>
        </button>
        <button
          type="button"
          onClick={() => onDrill({ title: "Area sold — order lines", filters: { ...base, hasArea: true } })}
          className="rounded-2xl bg-secondary p-5 text-left shadow-soft"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total Area Surface Sold</p>
          <p className="mt-2 break-words font-display text-2xl font-bold sm:text-3xl">{fmtSqft(kpis.sqft)} Sq.ft</p>
          <p className="mt-3 inline-flex rounded-full bg-card px-2.5 py-1 text-xs font-semibold">
            Yield: {inrFull(kpis.yieldPerSqft)} / sq.ft
          </p>
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <ExecutiveTrendChart
            title="Monthly Performance Progression"
            monthly={monthly}
            peak={peak}
            onPointClick={(row, metric) =>
              onDrill({
                title: `${row.label} — order lines`,
                filters: {
                  ...base,
                  from: row.ym,
                  to: row.ym,
                  month: row.ym,
                  ...(metric === "sqft" ? { hasArea: true } : {}),
                },
              })
            }
          />
        </div>
        <section className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-soft sm:p-5">
          <h3 className="flex items-center gap-2 font-display text-base font-bold">
            <MapPin className="h-4 w-4 text-primary" />
            Territory Revenue Concentration
          </h3>
          <div className="mt-4 max-h-[420px] space-y-4 overflow-y-auto pr-1">
            {territories.length === 0 ? (
              <p className="text-sm text-muted-foreground">No territory data.</p>
            ) : (
              territories.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => onDrill({ title: `${t.name} — order lines`, filters: { ...base, territory: t.name } })}
                  className="block w-full rounded-lg p-1 text-left hover:bg-secondary/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{t.name}</p>
                    <p className="shrink-0 text-sm font-bold">
                      {inrFull(t.revenue)} ({t.share.toFixed(1)}%)
                    </p>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, t.share)}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fmtNum(t.pcs)} PCS · {fmtSqft(t.sqft)} Sq.ft · {fmtNum(t.customers)} Customers
                  </p>
                </button>
              ))
            )}
          </div>
        </section>
      </div>

      {campaigns.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
          <h3 className="font-display text-base font-bold">Campaign performance</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onDrill({ title: `${c.name} — campaign lines`, filters: { ...base, campaignId: c.id } })}
                className="rounded-lg border border-border p-3 text-left hover:border-primary"
              >
                <p className="truncate font-semibold">{c.name}</p>
                <p className="mt-1 font-display text-lg font-bold text-primary">{inrFull(c.revenue)}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtNum(c.pcs)} PCS · {fmtNum(c.orders)} orders
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {(dealerTiers.length > 0 || distributorTiers.length > 0) && (
        <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
          <h3 className="font-display text-base font-bold">By pricing tier</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Grouped by the tier each account was on when the order was placed, so past sales stay accurate even
            after a tier is changed.
          </p>
          <div className="mt-4 grid gap-6 xl:grid-cols-2">
            <TierTable title="Dealer pricing tiers" rows={dealerTiers} />
            <TierTable title="Distributor pricing tiers" rows={distributorTiers} />
          </div>
        </section>
      )}
    </div>
  );
}

function TierTable({ title, rows }: { title: string; rows: TierBreakdownRow[] }) {
  return (
    <div className="min-w-0">
      <h4 className="text-sm font-bold">{title}</h4>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No tier data.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-2">Tier</th>
                <th className="px-2 py-2 text-right">Dealer revenue</th>
                <th className="px-2 py-2 text-right">Distributor revenue</th>
                <th className="px-2 py-2 text-right">PCS</th>
                <th className="px-2 py-2 text-right">Sq.ft</th>
                <th className="px-2 py-2 text-right">Orders</th>
                <th className="px-2 py-2 text-right">Accounts</th>
                <th className="px-2 py-2 text-right">Avg dealer margin %</th>
                <th className="px-2 py-2 text-right">Avg dist. margin %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.tierId} className={cn("border-b border-border/70", i % 2 === 1 && "bg-muted/40")}>
                  <td className="px-2 py-2 font-semibold">{r.tierName}</td>
                  <td className="px-2 py-2 text-right font-bold">{inrFull(r.revenue)}</td>
                  <td className="px-2 py-2 text-right">{inrFull(r.distributorRevenue)}</td>
                  <td className="px-2 py-2 text-right">{fmtNum(r.pcs)}</td>
                  <td className="px-2 py-2 text-right">{fmtSqft(r.sqft)}</td>
                  <td className="px-2 py-2 text-right">{fmtNum(r.orders)}</td>
                  <td className="px-2 py-2 text-right">{fmtNum(r.accounts)}</td>
                  <td className="px-2 py-2 text-right">{r.avgDealerMarginPercent.toFixed(1)}%</td>
                  <td className="px-2 py-2 text-right">{r.avgDistributorMarginPercent.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function momClass(mom: number) {
  return cn(mom > 0 ? "bg-success/15 text-success" : mom < 0 ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground");
}
