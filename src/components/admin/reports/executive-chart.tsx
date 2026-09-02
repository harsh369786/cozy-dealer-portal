import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, XAxis, YAxis } from "recharts";
import { Flame, LayoutGrid, LineChart as LineIcon, TrendingUp } from "lucide-react";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import type { MonthlyPoint } from "@/services/admin/executive-reports";
import { fmtNum, fmtSqft, inrLakh } from "@/services/admin/executive-reports";

export type ChartMetric = "revenue" | "pcs" | "sqft";
export type ChartMode = "modern" | "cards" | "velocity";

const METRICS: Array<{ id: ChartMetric; label: string }> = [
  { id: "revenue", label: "Revenue" },
  { id: "pcs", label: "Units (PCS)" },
  { id: "sqft", label: "Area (Sq.ft)" },
];

const MODES: Array<{ id: ChartMode; label: string; icon: typeof LineIcon }> = [
  { id: "modern", label: "Modern Chart", icon: LineIcon },
  { id: "cards", label: "Period Cards", icon: LayoutGrid },
  { id: "velocity", label: "Growth Velocity", icon: TrendingUp },
];

const CHART_COLOR = "#B45309";
const UP_COLOR = "#15803D";
const DOWN_COLOR = "#BE123C";

const chartMargin = { left: 4, right: 8, top: 8, bottom: 0 };

function metricValue(row: MonthlyPoint, metric: ChartMetric) {
  if (metric === "pcs") return row.pcs;
  if (metric === "sqft") return row.sqft;
  return row.revenue;
}

function formatMetric(n: number, metric: ChartMetric) {
  if (metric === "revenue") return inrLakh(n);
  if (metric === "pcs") return fmtNum(n);
  return fmtSqft(n);
}

function momPct(current: number, previous: number | undefined) {
  if (previous == null || previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

type ChartRow = MonthlyPoint & { value: number; momAbs: number };

function ChartTip({
  active,
  payload,
  metric,
  velocity,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartRow }>;
  metric: ChartMetric;
  velocity?: boolean;
}) {
  if (!active || !payload?.[0]) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-xl border border-border bg-card p-2 text-xs shadow-soft">
      <p className="font-bold">{row.label}</p>
      {velocity ? (
        <p className={row.momAbs >= 0 ? "text-success" : "text-destructive"}>
          {row.momAbs >= 0 ? "+" : ""}
          {row.momAbs.toFixed(1)}% MoM
        </p>
      ) : (
        <p>{formatMetric(row.value, metric)}</p>
      )}
    </div>
  );
}

export function ExecutiveTrendChart({
  title,
  monthly,
  peak,
  onPointClick,
}: {
  title: string;
  monthly: MonthlyPoint[];
  peak: MonthlyPoint | null;
  onPointClick: (row: MonthlyPoint) => void;
}) {
  const [mode, setMode] = useState<ChartMode>("modern");
  const [metric, setMetric] = useState<ChartMetric>("revenue");

  const data = useMemo<ChartRow[]>(
    () =>
      monthly.map((row, index) => {
        const value = metricValue(row, metric);
        const prev = index > 0 ? metricValue(monthly[index - 1]!, metric) : undefined;
        return { ...row, value, momAbs: momPct(value, prev) };
      }),
    [monthly, metric],
  );

  const maxByValue = data.reduce<ChartRow | null>((best, row) => (!best || row.value > best.value ? row : best), null);
  const peakForMetric =
    metric === "revenue" && peak ? (data.find((row) => row.ym === peak.ym) ?? maxByValue) : maxByValue;

  const openRow = (index: number) => {
    const row = data[index];
    if (row) onPointClick(row);
  };

  return (
    <section className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-soft sm:p-5">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold tracking-tight">{title}</h2>
          <div className="mt-2 flex flex-wrap gap-1">
            {MODES.map((m) => {
              const Icon = m.icon;
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold",
                    active ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {METRICS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMetric(m.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-semibold",
                metric === m.id ? "border-b-2 border-primary text-primary" : "text-muted-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {peakForMetric && (
        <button
          type="button"
          onClick={() => onPointClick(peakForMetric)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground"
        >
          <Flame className="h-3.5 w-3.5" />
          Peak: {peakForMetric.label} ({formatMetric(peakForMetric.value, metric)})
        </button>
      )}

      {monthly.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No order activity in this range.</p>
      ) : mode === "cards" ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          {data.map((row) => (
            <button
              key={row.ym}
              type="button"
              onClick={() => onPointClick(row)}
              className="rounded-xl border border-border bg-secondary/40 p-3 text-left hover:border-primary"
            >
              <p className="text-xs font-semibold text-muted-foreground">{row.label}</p>
              <p className="mt-1 break-words font-display text-lg font-bold">{formatMetric(row.value, metric)}</p>
              <p className={cn("mt-1 text-xs font-semibold", row.momAbs >= 0 ? "text-success" : "text-destructive")}>
                {row.momAbs >= 0 ? "+" : ""}
                {row.momAbs.toFixed(1)}% MoM
              </p>
            </button>
          ))}
        </div>
      ) : mode === "velocity" ? (
        <ChartContainer
          config={{ mom: { label: "MoM %", color: CHART_COLOR } }}
          className="mt-4 aspect-auto h-[260px] min-w-0 w-full sm:h-[320px]"
        >
          <BarChart data={data} margin={chartMargin} onClick={(state) => openRow(Number(state?.activeTooltipIndex ?? -1))}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#E8DFD0" />
            <XAxis dataKey="short" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} interval={0} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} width={44} />
            <ChartTooltip content={<ChartTip metric={metric} velocity />} />
            <Bar dataKey="momAbs" radius={[6, 6, 0, 0]} cursor="pointer" onClick={(_, index) => openRow(index)}>
              {data.map((row) => (
                <Cell key={row.ym} fill={row.momAbs >= 0 ? UP_COLOR : DOWN_COLOR} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      ) : (
        <ChartContainer
          config={{ value: { label: METRICS.find((m) => m.id === metric)?.label, color: CHART_COLOR } }}
          className="mt-4 aspect-auto h-[260px] min-w-0 w-full sm:h-[320px]"
        >
          <LineChart data={data} margin={chartMargin} onClick={(state) => openRow(Number(state?.activeTooltipIndex ?? -1))}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#E8DFD0" />
            <XAxis dataKey="short" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10 }}
              width={52}
              tickFormatter={(v) => (metric === "revenue" ? inrLakh(Number(v)) : fmtNum(Number(v)))}
            />
            <ChartTooltip content={<ChartTip metric={metric} />} />
            <Line
              type="monotone"
              dataKey="value"
              stroke={CHART_COLOR}
              strokeWidth={2.5}
              dot={{ r: 4, strokeWidth: 2, fill: "#fff" }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ChartContainer>
      )}
    </section>
  );
}
