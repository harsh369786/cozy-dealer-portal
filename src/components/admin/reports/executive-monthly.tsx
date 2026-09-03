import type { SnapshotReport } from "@/services/admin/executive-reports";
import { fmtNum, fmtSqft, inrFull } from "@/services/admin/executive-reports";
import { ExecutiveTrendChart } from "./executive-chart";
import { momClass } from "./executive-snapshot";
import type { DrillContext } from "./executive-types";
import { cn } from "@/lib/utils";

export function ExecutiveMonthlyPage({
  data,
  onDrill,
  onFilterPeriod,
}: {
  data: SnapshotReport;
  onDrill: (ctx: DrillContext) => void;
  onFilterPeriod: (ym: string) => void;
}) {
  const { monthly, peak, filters } = data;
  const base = { ...filters };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">Monthly Timeline & Trajectory</h2>
      <ExecutiveTrendChart
        title="Monthly Revenue & Volume Trend"
        monthly={monthly}
        peak={peak}
        onPointClick={(row) =>
          onDrill({ title: `${row.label} — order lines`, filters: { ...base, from: row.ym, to: row.ym, month: row.ym } })
        }
      />
      <section className="rounded-xl border border-border bg-card p-4 shadow-soft sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-base font-bold">Month & Year Breakdown Matrix</h3>
          <p className="text-sm text-muted-foreground">{monthly.length} Periods Analyzed</p>
        </div>
        {monthly.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No monthly totals for this range.</p>
        ) : (
          <div className="mt-4 -mx-2 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-2">Month & Year</th>
                  <th className="px-2 py-2 text-right">Total Revenue</th>
                  <th className="px-2 py-2 text-right">Total PCS</th>
                  <th className="px-2 py-2 text-right">Total Sq.ft</th>
                  <th className="px-2 py-2 text-right">Avg ₹ / Sq.ft</th>
                  <th className="px-2 py-2">MoM Growth</th>
                  <th className="px-2 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((row) => (
                  <tr key={row.ym} className="border-b border-border/70">
                    <td className="px-2 py-3">
                      <button
                        type="button"
                        className="font-semibold hover:underline"
                        onClick={() => onDrill({ title: `${row.label} — order lines`, filters: { ...base, month: row.ym, from: row.ym, to: row.ym } })}
                      >
                        {row.label}
                      </button>
                    </td>
                    <td className="px-2 py-3 text-right font-bold text-primary">{inrFull(row.revenue)}</td>
                    <td className="px-2 py-3 text-right">{fmtNum(row.pcs)}</td>
                    <td className="px-2 py-3 text-right">{fmtSqft(row.sqft)}</td>
                    <td className="px-2 py-3 text-right">{inrFull(row.avgPerSqft)}</td>
                    <td className="px-2 py-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", momClass(row.mom))}>
                        {row.mom >= 0 ? "+" : ""}
                        {row.mom.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <button type="button" className="text-sm font-semibold text-primary underline" onClick={() => onFilterPeriod(row.ym)}>
                        Filter by Period
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
