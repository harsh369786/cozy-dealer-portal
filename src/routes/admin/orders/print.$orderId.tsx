import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { useSession } from "@/hooks/use-session";
import { getOrder } from "@/services/admin/orders";
import {
  getJobCardProductData,
  JOB_CARD_LAYER_ROWS,
  type JobCardProductData,
} from "../../../../shared/job-card-product-master";

export const Route = createFileRoute("/admin/orders/print/$orderId")({
  component: PrintJobCardPage,
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Parse a "DD/MM/YYYY, h:mm AM/PM" (or "DD/MM/YYYY") label into a Date, or null. */
function parseDdMmYyyy(label?: string | null): Date | null {
  if (!label) return null;
  const m = label.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Format a Date as "05-08-2026 (Wednesday)". */
function formatJobCardDate(d: Date | null): string {
  if (!d) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy} (${WEEKDAYS[d.getDay()]})`;
}

/** Pull dimensions from a size string like `73" × 33"` or `73 x 33`. Returns inches or null. */
function parseSize(size?: string | null): { length: number | null; width: number | null } {
  if (!size) return { length: null, width: null };
  const nums = size.match(/[\d.]+/g);
  if (!nums || nums.length < 2) return { length: null, width: null };
  return { length: Number(nums[0]), width: Number(nums[1]) };
}

/** Parse a thickness label like `6.5"` or `6.5 inch` into inches, or null. */
function parseThickness(thickness?: string | null): number | null {
  if (!thickness) return null;
  const m = thickness.match(/[\d.]+/);
  return m ? Number(m[0]) : null;
}

function inch(n: number | null): string {
  return n == null || Number.isNaN(n) ? "—" : `${n} in`;
}

/**
 * The order notes column stores "Order placed by: <name>\n\n<special instruction>". The special
 * instruction is everything AFTER that first "Order placed by" line. Returns "" when there's none.
 */
function extractSpecialInstructions(notes?: string | null): string {
  if (!notes) return "";
  const text = notes.trim();
  const lines = text.split(/\n+/);
  const rest = lines.filter((l) => !/^order placed by\s*:/i.test(l.trim()));
  return rest.join("\n").trim();
}

// ── Page ─────────────────────────────────────────────────────────────────────

function PrintJobCardPage() {
  const { t } = useTranslation();
  const { orderId } = Route.useParams();
  const { user } = useSession();

  const { data: order, loading, error, retry } = useAsyncData(() => getOrder(orderId), [orderId]);

  // Auto-open the browser print dialog (acts like Ctrl+P) once the card is rendered.
  useEffect(() => {
    if (order && !loading) {
      const timer = setTimeout(() => window.print(), 500);
      return () => clearTimeout(timer);
    }
  }, [order, loading]);

  if (loading && !order) return <PageSkeleton rows={3} />;
  if (error || !order) return <ErrorState message={error ?? t("common.orderNotFound")} onRetry={retry} />;

  // The Job Card is per mattress line item; use the first item (orders are single-item today).
  const item = order.items[0];
  const master = getJobCardProductData(item?.model);

  const orderDate = formatJobCardDate(parseDdMmYyyy(order.placedAt));
  const printDate = formatJobCardDate(new Date());

  // Actual ordered mattress size (real-time from the app). Prefer the requested (raw) size the
  // dealer entered; fall back to the standard size.
  const actual = parseSize(item?.sizeRequested ?? item?.size ?? item?.sizeStandard);
  const thicknessIn = parseThickness(item?.thickness);

  // Cutting size = actual size reduced by the Excel "SIZE REDUCE BY" (per dimension). Thickness is
  // NOT reduced. When we can't resolve the reduction, fall back to the actual size.
  const reduceBy = master?.sizeReduceInches ?? 0.5;
  const cutLength = actual.length != null ? actual.length - reduceBy : null;
  const cutWidth = actual.width != null ? actual.width - reduceBy : null;

  const specialInstructions = extractSpecialInstructions(order.notes);

  return (
    <div className="job-card-print mx-auto max-w-[900px] bg-white p-6 text-[#0b3b73]">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          body * { visibility: hidden; }
          .job-card-print, .job-card-print * { visibility: visible; }
          .job-card-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
        }
        .jc-box { border: 2px solid #1e4b8f; border-radius: 12px; }
        .jc-field { background: #eaf1fb; border-radius: 8px; }
      `}</style>

      {/* Title */}
      <div className="mb-4 flex items-center gap-4">
        <div className="h-1 flex-1 bg-[#1e4b8f]" />
        <div className="rounded-xl bg-[#1e4b8f] px-8 py-2 text-2xl font-extrabold tracking-wide text-white">
          JOB CARD
        </div>
        <div className="h-1 flex-1 bg-[#1e4b8f]" />
      </div>

      {/* Row 1: Order Details | Cutting Size + FARMA */}
      <div className="grid grid-cols-2 gap-4">
        {/* Order Details */}
        <section className="jc-box p-4">
          <SectionHeading title="ORDER DETAILS" note />
          <div className="mt-3 space-y-2 text-sm">
            <FieldRow label="Order Date" value={orderDate} />
            <FieldRow label="Order No." value={order.id} />
            <FieldRow label="Dealer Name" value={order.dealerName} />
            <FieldRow label="Distributor Name" value={order.distributorName ?? "—"} />
            <FieldRow label="Area" value={order.dealerArea ?? "—"} />
            <FieldRow label="Mattress Name" value={item?.model ?? "—"} />
          </div>
        </section>

        <div className="space-y-4">
          {/* Cutting Size */}
          <section className="jc-box p-4">
            <SectionHeading title="CUTTING SIZE" note />
            <DimensionRow length={inch(cutLength)} width={inch(cutWidth)} thickness={inch(thicknessIn)} />
          </section>

          {/* FARMA */}
          <section className="jc-box p-4">
            <SectionHeading title="FARMA" note />
            <FarmaGrid corners={item?.farmaCorners} note={item?.farmaDetails} enabled={item?.farma} />
          </section>
        </div>
      </div>

      {/* Row 2: Special Instructions (full width) */}
      <section className="jc-box mt-4 p-4">
        <SectionHeading title="SPECIAL INSTRUCTIONS" note />
        <div className="jc-field mt-2 min-h-[2.25rem] px-3 py-2 text-sm">
          {specialInstructions || "—"}
        </div>
      </section>

      {/* Row 3: Layers | Labels + Consumer Scheme + Actual Size + Checked By */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        {/* Layers */}
        <section className="jc-box p-4">
          <SectionHeading title="LAYERS" excel />
          <LayersTable master={master} />
        </section>

        <div className="space-y-4">
          {/* Labels */}
          <section className="jc-box p-4">
            <SectionHeading title="LABELS" excel />
            <div className="mt-2 space-y-2 text-sm">
              <FieldRow label="Label 1" value={master?.label1 || "—"} />
              <FieldRow label="Label 2" value={master?.label2 || "—"} />
            </div>
          </section>

          {/* Consumer Scheme */}
          <section className="jc-box p-4">
            <SectionHeading title="CONSUMER SCHEME" note />
            <div className="mt-2 space-y-2 text-sm">
              <FieldRow label="Option 1" value={master?.consumerScheme1 || "—"} />
              <FieldRow label="Option 2" value={master?.consumerScheme2 || "—"} />
            </div>
          </section>

          {/* Actual Mattress Size */}
          <section className="jc-box p-4">
            <SectionHeading title="ACTUAL MATTRESS SIZE" note />
            <DimensionRow
              length={inch(actual.length)}
              width={inch(actual.width)}
              thickness={inch(thicknessIn)}
            />
            <div className="mt-3 space-y-2 text-sm">
              <FieldRow label="Checked by" value={user?.name ?? "—"} />
              <FieldRow label="Date" value={printDate} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ── Presentational sub-components ─────────────────────────────────────────────

function SectionHeading({ title, note, excel }: { title: string; note?: boolean; excel?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <h2 className="text-lg font-extrabold tracking-wide text-[#1e4b8f]">{title}</h2>
      {note && <span className="text-xs text-[#5a7bb0]">(Take the real-time data from the app)</span>}
      {excel && <span className="text-xs text-[#5a7bb0]">(Take the data from Excel)</span>}
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-36 shrink-0 font-semibold">{label}</span>
      <span className="shrink-0">:</span>
      <span className="jc-field flex-1 px-3 py-1.5 font-medium">{value}</span>
    </div>
  );
}

function DimensionRow({
  length,
  width,
  thickness,
}: {
  length: string;
  width: string;
  thickness: string;
}) {
  return (
    <div className="mt-3 flex items-center gap-2">
      <DimensionCell value={length} label="Length" />
      <span className="font-bold">X</span>
      <DimensionCell value={width} label="Width" />
      <span className="font-bold">X</span>
      <DimensionCell value={thickness} label="Thickness" />
    </div>
  );
}

function DimensionCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-1 text-center">
      <div className="jc-field px-2 py-2 text-base font-bold">{value}</div>
      <div className="mt-1 text-xs font-semibold text-[#5a7bb0]">{label}</div>
    </div>
  );
}

/**
 * FARMA: four corner slots + a Note, populated from the actual order data. The app stores which
 * corners were selected (farmaCorners) and a free-text note (farmaDetails). Each corner slot shows
 * its captured value; unselected corners render blank.
 */
function FarmaGrid({
  corners,
  note,
  enabled,
}: {
  corners?: string[];
  note?: string;
  enabled?: boolean;
}) {
  const selected = new Set((corners ?? []).map((c) => c.toLowerCase()));
  const valueFor = (cornerLabel: string) =>
    enabled && selected.has(cornerLabel.toLowerCase()) ? cornerLabel : "";

  return (
    <div className="mt-3 space-y-2 text-sm">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <FieldRow label="Top Left" value={valueFor("Top left")} />
        <FieldRow label="Top Right" value={valueFor("Top right")} />
        <FieldRow label="Bottom Left" value={valueFor("Bottom left")} />
        <FieldRow label="Bottom Right" value={valueFor("Bottom right")} />
      </div>
      <FieldRow label="Note" value={note || ""} />
    </div>
  );
}

function LayersTable({ master }: { master: JobCardProductData | null }) {
  return (
    <table className="mt-2 w-full border-collapse text-sm">
      <thead>
        <tr className="text-left text-[#1e4b8f]">
          <th className="w-10 py-1.5 font-bold">No.</th>
          <th className="py-1.5 font-bold">Layer</th>
          <th className="py-1.5 font-bold">Description (from Excel)</th>
        </tr>
      </thead>
      <tbody>
        {JOB_CARD_LAYER_ROWS.map((row, i) => {
          const desc = master?.layers[row.key] ?? "";
          return (
            <tr key={row.key} className={i % 2 === 1 ? "bg-[#eaf1fb]" : undefined}>
              <td className="py-1.5">{i + 1}</td>
              <td className="py-1.5">{row.label}</td>
              <td className="py-1.5">
                <span className="mr-2">:</span>
                {desc || "-"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
