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

  // Auto-open the browser print dialog (acts like Ctrl+P) once the card is rendered. The browser
  // uses document.title as the default "Save as PDF" filename, so set it to the order number while
  // printing (e.g. "BR-11092604"), then restore the previous title afterwards.
  useEffect(() => {
    if (!order || loading) return;
    const previousTitle = document.title;
    document.title = `${order.id}`;
    const timer = setTimeout(() => window.print(), 500);
    const restore = () => {
      document.title = previousTitle;
    };
    window.addEventListener("afterprint", restore);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("afterprint", restore);
      document.title = previousTitle;
    };
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
    <div className="job-card-print">
      <style>{`
        /* Print target: A5 LANDSCAPE (210mm x 148mm). Printable area after a 5mm @page margin is
           ~200mm x 138mm. The card is fixed to exactly that box and every section is compacted so
           the ENTIRE card (through Actual Mattress Size / Checked by) fits on ONE page — nothing is
           cropped. overflow:hidden on the fixed-height card is the final safety net. */
        @media print {
          @page { size: A5 landscape; margin: 4mm; }
          html, body { margin: 0; padding: 0; }
          body * { visibility: hidden; }
          .job-card-print, .job-card-print * { visibility: visible; }
          .job-card-print { position: absolute; left: 0; top: 0; width: 100%; }
          .jc-card {
            width: 202mm;
            height: 140mm;   /* one A5-landscape page at 4mm margins; overflow clipped as safety net */
            max-width: none;
            padding: 0;
            margin: 0;
            overflow: hidden;
          }
        }
        /* Flex column so the three rows spread across the whole page height with NO empty bottom
           band, while staying within one A5-landscape page. Font sizes are the sweet spot: large
           enough to read, small enough that all sections (through Actual Mattress Size) fit. */
        .jc-card {
          box-sizing: border-box;
          width: 100%;
          max-width: 1040px;
          height: 140mm;
          margin: 0 auto;
          padding: 2mm;
          background: #fff;
          color: #0b3b73;
          font-family: Arial, Helvetica, sans-serif;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .jc-box { border: 1.25px solid #1e4b8f; border-radius: 7px; padding: 3px 8px; }
        .jc-field { background: #eaf1fb; border-radius: 5px; }
        .jc-title { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
        .jc-title .jc-rule { flex: 1; height: 3px; background: #1e4b8f; }
        .jc-title .jc-badge {
          border-radius: 7px; background: #1e4b8f; color: #fff; padding: 3px 22px;
          font-size: 17px; font-weight: 800; letter-spacing: 1.2px;
        }
        .jc-h { font-size: 11px; font-weight: 800; letter-spacing: 0.3px; color: #1e4b8f; margin-bottom: 2px; }
        .jc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
        .jc-row { display: flex; align-items: center; gap: 6px; font-size: 10px; margin-top: 2px; }
        .jc-row .jc-key { width: 96px; flex-shrink: 0; font-weight: 700; }
        .jc-row .jc-sep { flex-shrink: 0; }
        .jc-row .jc-val { flex: 1; background: #eaf1fb; border-radius: 4px; padding: 2px 6px; font-weight: 600; }
        .jc-dims { display: flex; align-items: center; gap: 6px; margin-top: 3px; }
        .jc-dim { flex: 1; text-align: center; }
        .jc-dim .jc-dim-v { background: #eaf1fb; border-radius: 4px; padding: 3px 4px; font-size: 13px; font-weight: 800; }
        .jc-dim .jc-dim-l { font-size: 8px; font-weight: 700; color: #5a7bb0; margin-top: 1px; }
        .jc-x { font-weight: 800; font-size: 11px; }
        /* Layers table fills the tall left box of row 3. Readable font, but sized so ALL 10 rows
           fit inside the box height without the last row (Piping) being clipped at the bottom.
           height:100% lets rows distribute; modest padding keeps the total height in check. */
        table.jc-layers { width: 100%; height: 100%; border-collapse: collapse; margin-top: 2px; }
        table.jc-layers th { text-align: left; font-size: 11px; font-weight: 800; color: #1e4b8f; padding: 1px 4px; }
        table.jc-layers td { font-size: 11px; padding: 1.5px 4px; line-height: 1.2; vertical-align: middle; }
        table.jc-layers tr.alt td { background: #eaf1fb; }
        /* Keep the layer NAME on a single line (e.g. "Bottom Fabric") so no row grows to two lines
           and pushes the last row (Piping) off the box. */
        table.jc-layers td.jc-layer-name { white-space: nowrap; font-weight: 600; }
        /* Let the layers table grow to fill the tall LAYERS box (row 3 boxes are flex columns). */
        .jc-layers-box { display: flex; flex-direction: column; min-height: 0; }
        .jc-layers-box table.jc-layers { flex: 1 1 auto; }
        .jc-mt { margin-top: 3px; }
        /* Row layout: rows 1 & 2 take their natural height; row 3 grows to fill the rest of the
           page so there is no empty band at the bottom. min-height:0 lets the grid children shrink
           correctly inside the flex column instead of forcing overflow. */
        .jc-row1 { flex: 0 0 auto; }
        .jc-row2 { flex: 0 0 auto; }
        .jc-row3 { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 5px; }
        .jc-row3 > .jc-box, .jc-row3 > div { display: flex; flex-direction: column; min-height: 0; }
        .jc-row3 .jc-fill { flex: 1 1 auto; }
      `}</style>

      <div className="jc-card">
        {/* Title */}
        <div className="jc-title">
          <div className="jc-rule" />
          <div className="jc-badge">JOB CARD</div>
          <div className="jc-rule" />
        </div>

        {/* Row 1: Order Details | Cutting Size + FARMA */}
        <div className="jc-grid jc-row1">
          <section className="jc-box">
            <div className="jc-h">ORDER DETAILS</div>
            <Field label="Order Date" value={orderDate} />
            <Field label="Order No." value={order.id} />
            <Field label="Dealer Name" value={order.dealerName} />
            <Field label="Distributor Name" value={order.distributorName ?? "—"} />
            <Field label="Area" value={order.dealerArea ?? "—"} />
            <Field label="Mattress Name" value={item?.model ?? "—"} />
            <Field label="Quantity" value={`${Number(item?.quantity ?? order.totalItems ?? 1) || 1} Nos`} />
          </section>

          <div>
            <section className="jc-box">
              <div className="jc-h">CUTTING SIZE</div>
              <Dimensions length={inch(cutLength)} width={inch(cutWidth)} thickness={inch(thicknessIn)} />
            </section>

            <section className="jc-box jc-mt">
              <div className="jc-h">FARMA</div>
              <FarmaGrid corners={item?.farmaCorners} note={item?.farmaDetails} enabled={item?.farma} />
            </section>
          </div>
        </div>

        {/* Row 2: Special Instructions (full width, single compact line to save vertical space) */}
        <section className="jc-box jc-mt jc-row2" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="jc-h" style={{ marginBottom: 0, flexShrink: 0 }}>SPECIAL INSTRUCTIONS</div>
          <div className="jc-field" style={{ flex: 1, padding: "2px 6px", fontSize: 10 }}>
            {specialInstructions || "—"}
          </div>
        </section>

        {/* Row 3: Layers | Labels + Consumer Scheme + Actual Size + Checked By.
            This row grows to fill the remaining page height so there's no empty band at the bottom. */}
        <div className="jc-row3">
          <section className="jc-box jc-layers-box">
            <div className="jc-h">LAYERS</div>
            <LayersTable master={master} />
          </section>

          <div>
            <section className="jc-box">
              <div className="jc-h">LABELS</div>
              <Field label="Label 1" value={master?.label1 || "—"} />
              <Field label="Label 2" value={master?.label2 || "—"} />
              {/* Label 3 = the ordered product/model name. */}
              <Field label="Label 3" value={item?.model ?? "—"} />
            </section>

            <section className="jc-box jc-mt">
              <div className="jc-h">CONSUMER SCHEME</div>
              <Field label="Option 1" value={master?.consumerScheme1 || "—"} />
              <Field label="Option 2" value={master?.consumerScheme2 || "—"} />
            </section>

            <section className="jc-box jc-mt jc-fill">
              <div className="jc-h">ACTUAL MATTRESS SIZE</div>
              <Dimensions
                length={inch(actual.length)}
                width={inch(actual.width)}
                thickness={inch(thicknessIn)}
              />
              <Field label="Checked by" value={user?.name ?? "—"} />
              <Field label="Date" value={printDate} />
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Presentational sub-components (compact, A5-landscape) ─────────────────────

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="jc-row">
      <span className="jc-key">{label}</span>
      <span className="jc-sep">:</span>
      <span className="jc-val">{value}</span>
    </div>
  );
}

function Dimensions({
  length,
  width,
  thickness,
}: {
  length: string;
  width: string;
  thickness: string;
}) {
  return (
    <div className="jc-dims">
      <DimensionCell value={length} label="Length" />
      <span className="jc-x">X</span>
      <DimensionCell value={width} label="Width" />
      <span className="jc-x">X</span>
      <DimensionCell value={thickness} label="Thickness" />
    </div>
  );
}

function DimensionCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="jc-dim">
      <div className="jc-dim-v">{value}</div>
      <div className="jc-dim-l">{label}</div>
    </div>
  );
}

/**
 * FARMA: four corner slots + a Note, populated from the actual order data. The app stores which
 * corners were selected (farmaCorners) and a free-text note (farmaDetails). Each SELECTED corner
 * shows a ✓ tick; unselected corners render blank.
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
  // Show a tick ONLY on the selected positions; everything else stays blank.
  const valueFor = (cornerLabel: string) =>
    enabled && selected.has(cornerLabel.toLowerCase()) ? "✓" : "";

  return (
    <div>
      <div className="jc-grid">
        <Field label="Top Left" value={valueFor("Top left")} />
        <Field label="Top Right" value={valueFor("Top right")} />
        <Field label="Bottom Left" value={valueFor("Bottom left")} />
        <Field label="Bottom Right" value={valueFor("Bottom right")} />
      </div>
      <Field label="Note" value={note || ""} />
    </div>
  );
}

function LayersTable({ master }: { master: JobCardProductData | null }) {
  return (
    <table className="jc-layers">
      <thead>
        <tr>
          <th style={{ width: 22 }}>No.</th>
          <th style={{ width: 96 }}>Layer</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {JOB_CARD_LAYER_ROWS.map((row, i) => {
          const desc = master?.layers[row.key] ?? "";
          return (
            <tr key={row.key} className={i % 2 === 1 ? "alt" : undefined}>
              <td>{i + 1}</td>
              <td className="jc-layer-name">{row.label}</td>
              <td>: {desc || "-"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
