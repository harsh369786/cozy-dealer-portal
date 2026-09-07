import { useMemo, useState } from "react";
import type { AccountRow, AccountsReport } from "@/services/admin/executive-reports";
import { fmtNum, fmtSqft, inrFull } from "@/services/admin/executive-reports";
import type { DrillContext } from "./executive-types";
import { cn } from "@/lib/utils";

const TIER_META = {
  A: {
    title: "Tier A Customers (70% Revenue)",
    desc: "Primary revenue drivers with strategic priority.",
    className: "bg-primary/10 border-primary/20",
    valueClass: "text-primary",
  },
  B: {
    title: "Tier B Customers (70–90%)",
    desc: "High-growth expansion potential.",
    className: "bg-accent/20 border-accent/30",
    valueClass: "text-foreground",
  },
  C: {
    title: "Tier C Customers (Tail 10%)",
    desc: "Transactional / niche product buyers.",
    className: "bg-muted border-border",
    valueClass: "text-muted-foreground",
  },
} as const;

export function ExecutiveAccountsPage({
  data,
  onDrill,
  onFilterDealer,
}: {
  data: AccountsReport;
  onDrill: (ctx: DrillContext) => void;
  onFilterDealer: (dealerId: string) => void;
}) {
  const [tierFilter, setTierFilter] = useState<"A" | "B" | "C" | null>(null);
  const accounts = data.accounts ?? [];
  const tiers = data.tiers ?? { A: { count: 0, revenue: 0 }, B: { count: 0, revenue: 0 }, C: { count: 0, revenue: 0 } };
  const rows = useMemo(
    () => (tierFilter ? accounts.filter((a) => a.tier === tierFilter) : accounts),
    [accounts, tierFilter],
  );

  const drillDealer = (row: AccountRow) =>
    onDrill({
      title: `${row.name} — order lines`,
      filters: { ...data.filters, dealerId: row.id },
    });

  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">Key Accounts & Strategic Customer Portfolio</h2>
      <div className="grid gap-3 md:grid-cols-3">
        {(["A", "B", "C"] as const).map((tier) => {
          const meta = TIER_META[tier];
          const ids = accounts.filter((a) => a.tier === tier).map((a) => a.id);
          return (
            <button
              key={tier}
              type="button"
              onClick={() => {
                setTierFilter((cur) => (cur === tier ? null : tier));
                onDrill({
                  title: `Tier ${tier} dealers — order lines`,
                  filters: { ...data.filters, dealerIds: ids.join(",") },
                });
              }}
              className={cn("rounded-xl border p-4 text-left", meta.className, tierFilter === tier && "ring-2 ring-primary")}
            >
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{meta.title}</p>
              <p className={cn("mt-2 font-display text-3xl font-bold", meta.valueClass)}>{tiers[tier].count} Accounts</p>
              <p className="mt-2 text-sm text-muted-foreground">{meta.desc}</p>
              <p className="mt-1 text-xs font-semibold">{inrFull(tiers[tier].revenue)}</p>
            </button>
          );
        })}
      </div>

      <section className="rounded-xl border border-border bg-card p-4 shadow-soft sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-base font-bold">Customer Performance Ranking</h3>
          <p className="text-sm text-muted-foreground">{accounts.length} Total Customers</p>
        </div>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No dealer revenue in this range.</p>
        ) : (
          <div className="mt-4 max-h-[560px] overflow-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-2">Rank & Customer</th>
                  <th className="px-2 py-2">Tier</th>
                  <th className="px-2 py-2 text-right">Revenue</th>
                  <th className="px-2 py-2 text-right">Share</th>
                  <th className="px-2 py-2 text-right">PCS</th>
                  <th className="px-2 py-2 text-right">Sq.ft</th>
                  <th className="px-2 py-2">Territory</th>
                  <th className="px-2 py-2">Pricing tier</th>
                  <th className="px-2 py-2">Drilldown</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id} className={cn("border-b border-border/70", i % 2 === 1 && "bg-muted/40")}>
                    <td className="px-2 py-3">
                      <button type="button" className="flex items-center gap-2 text-left" onClick={() => drillDealer(row)}>
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold">{row.rank}</span>
                        <span className="font-semibold hover:underline">{row.name}</span>
                      </button>
                    </td>
                    <td className="px-2 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-bold",
                          row.tier === "A" && "bg-primary/15 text-primary",
                          row.tier === "B" && "bg-accent/40",
                          row.tier === "C" && "bg-muted",
                        )}
                      >
                        Tier {row.tier}
                      </span>
                    </td>
                    <td className={cn("px-2 py-3 text-right font-bold", row.tier === "A" && "text-primary")}>{inrFull(row.revenue)}</td>
                    <td className="px-2 py-3 text-right">{row.share.toFixed(1)}%</td>
                    <td className="px-2 py-3 text-right">{fmtNum(row.pcs)}</td>
                    <td className="px-2 py-3 text-right">{fmtSqft(row.sqft)}</td>
                    <td className="px-2 py-3 uppercase">{row.territory}</td>
                    <td className="px-2 py-3">
                      {/* Pricing tier snapshotted at sale time: dealer tier, with distributor tier below. */}
                      <span className="font-semibold">{row.dealerTierName}</span>
                      <span className="block text-xs text-muted-foreground">
                        Dist: {row.distributorTierName}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <button
                        type="button"
                        className="rounded-md bg-primary/10 px-2 py-1 text-xs font-bold text-primary"
                        onClick={() => {
                          onFilterDealer(row.id);
                          drillDealer(row);
                        }}
                      >
                        View Items
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
