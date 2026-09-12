import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { getOrder } from "@/services/admin/orders";

export const Route = createFileRoute("/admin/orders/sticker/$orderId")({
  component: PrintMrpStickerPage,
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a "DD/MM/YYYY, h:mm AM/PM" (or "DD/MM/YYYY") label into {dd,mm,yyyy}, or null. */
function parseDdMmYyyy(label?: string | null): { dd: string; mm: string; yyyy: string } | null {
  if (!label) return null;
  const m = label.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return { dd: m[1], mm: m[2], yyyy: m[3] };
}

/** Pull L × B from a size string like `73" × 33"` or `73 x 33`. */
function parseSize(size?: string | null): { length: string | null; width: string | null } {
  if (!size) return { length: null, width: null };
  const nums = size.match(/[\d.]+/g);
  if (!nums || nums.length < 2) return { length: null, width: null };
  return { length: nums[0]!, width: nums[1]! };
}

function parseThicknessNum(thickness?: string | null): number | null {
  if (!thickness) return null;
  const m = thickness.match(/[\d.]+/);
  return m ? Number(m[0]) : null;
}

/** Two-decimal inch string, or "—". */
function dim(v: string | number | null): string {
  if (v == null || v === "" || Number.isNaN(Number(v))) return "—";
  return Number(v).toFixed(2);
}

// ── Page ─────────────────────────────────────────────────────────────────────

function PrintMrpStickerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { orderId } = Route.useParams();
  const { can, isMasterAdmin, loading: permsLoading } = useAdminPermissions();

  // Role guard: only admin (master_admin) and admin_staff may print the MRP sticker. Both hold
  // orders:status:fulfillment (admin_staff's operational order permission); master_admin is allowed
  // outright. Anyone else is bounced back to the order.
  const allowed = isMasterAdmin || can("orders:status:fulfillment");
  useEffect(() => {
    if (!permsLoading && !allowed) {
      navigate({ to: "/admin/orders/$orderId", params: { orderId } });
    }
  }, [permsLoading, allowed, navigate, orderId]);

  const { data: order, loading, error, retry } = useAsyncData(() => getOrder(orderId), [orderId]);

  // Auto-open the print dialog once the sticker is rendered (acts like Ctrl+P). The browser uses
  // document.title as the default "Save as PDF" filename, so name it "<orderId>-sticker".
  useEffect(() => {
    if (!order || loading || !allowed) return;
    const previousTitle = document.title;
    document.title = `${order.id}-sticker`;
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
  }, [order, loading, allowed]);

  if (permsLoading || !allowed) return null;
  if (loading && !order) return <PageSkeleton rows={3} />;
  if (error || !order) return <ErrorState message={error ?? t("common.orderNotFound")} onRetry={retry} />;

  const item = order.items[0];
  const size = parseSize(item?.sizeRequested ?? item?.size ?? item?.sizeStandard);
  const thicknessNum = parseThicknessNum(item?.thickness);
  const placed = parseDdMmYyyy(order.placedAt);

  const productName = item?.model ?? "—";
  // Print ONLY the product name (no "BACKREST" brand prefix — the physical label already carries the
  // pre-printed brand header). Append the thickness in parentheses, e.g. "(5.5 INCH)".
  const productTitle =
    thicknessNum != null ? `${productName} (${thicknessNum} INCH)` : productName;

  // Size row matches the printed label's order: Breadth (width) x Length x Thickness, 2 decimals
  // (e.g. "35.50 x 71.50 x 5.50"). Our order size string is stored as Length × Breadth, so width
  // is the second parsed number.
  const sizeText = `${dim(size.width)} x ${dim(size.length)} x ${dim(thicknessNum)}`;
  const qty = Number(item?.quantity ?? order.totalItems ?? 1) || 1;
  const mrp = Number(item?.mrp ?? 0) || 0;
  const mfgOn = placed ? `${placed.mm}/${placed.yyyy}` : "—";
  // Batch No now shows this order's own order number (e.g. "BR-12092604") instead of a derived code.
  const batchNo = order.id;

  return (
    <div className="mrp-sticker-print">
      <style>{`
        /* PREDEFINED READY-MADE STICKER (75mm x 125mm portrait). The physical label already has the
           BACKREST header (top) and the Shree Sacha Foam footer (bottom) PRE-PRINTED — we must NOT
           re-print those or they'd double up. We print ONLY the variable content (product name +
           spec table) into the BLANK middle band, offset from the top to clear the pre-printed
           header and stopping above the pre-printed footer. */
        @media print {
          @page { size: 75mm 125mm; margin: 0; }
          html, body { margin: 0; padding: 0; }
          .mrp-sticker-print { display: block; }
          body * { visibility: hidden; }
          .mrp-sticker, .mrp-sticker * { visibility: visible; }
          /* One label per physical unit. Each sticker is exactly one 75x125mm page and forces a
             page break AFTER itself, so a qty-N order feeds N labels (each "1 Nos" + per-unit MRP).
             break-before on every-but-first is the most reliable way to advance a label printer. */
          .mrp-sticker { break-inside: avoid; page-break-inside: avoid; }
          .mrp-sticker + .mrp-sticker { break-before: page; page-break-before: always; }
        }
        .mrp-sticker {
          box-sizing: border-box;
          width: 75mm;
          height: 125mm;
          margin: 0 auto;
          /* Position content in the BLANK band between the pre-printed header (~28mm) and the
             pre-printed Shree Sacha Foam footer (~90mm from top). */
          padding: 29mm 6mm 37mm 6mm;
          background: #fff;
          color: #000;
          font-family: Arial, Helvetica, sans-serif;
          overflow: hidden;
        }
        .mrp-sticker .st-product {
          font-weight: 800; font-size: 15px; line-height: 1.15; text-transform: uppercase;
          margin: 0 0 8px;
        }
        .mrp-sticker table { width: 100%; border-collapse: collapse; }
        .mrp-sticker td {
          border: 1px solid #000; padding: 3px 6px; vertical-align: middle;
        }
        .mrp-sticker td.st-label { width: 46%; font-weight: 700; font-size: 10px; }
        .mrp-sticker td.st-label small { display: block; font-weight: 400; font-size: 8px; }
        .mrp-sticker td.st-value { font-weight: 700; font-size: 12px; }
      `}</style>

      {/* Only the VALUES — header + footer are already printed on the physical sticker.
          Render ONE sticker per unit: qty copies, each showing "1 Nos" and the per-unit MRP. */}
      {Array.from({ length: qty }).map((_, i) => (
        <div className="mrp-sticker" key={i}>
          {/* Product name (name + thickness) */}
          <div className="st-product">{productTitle}</div>

          {/* Spec table */}
          <table>
            <tbody>
              <tr>
                <td className="st-label">
                  Size <small>(Inches)</small>
                </td>
                <td className="st-value">{sizeText}</td>
              </tr>
              <tr>
                <td className="st-label">
                  Quantity <small>(In Pcs)</small>
                </td>
                <td className="st-value">1 Nos</td>
              </tr>
              <tr>
                <td className="st-label">
                  MRP <small>(Incl. of all Taxes)</small>
                </td>
                <td className="st-value">INR {mrp.toLocaleString("en-IN")}/-</td>
              </tr>
              <tr>
                <td className="st-label">
                  Mfg on <small>(month &amp; year)</small>
                </td>
                <td className="st-value">{mfgOn}</td>
              </tr>
              <tr>
                <td className="st-label">Batch No</td>
                <td className="st-value">{batchNo}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
