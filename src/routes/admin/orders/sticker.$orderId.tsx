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

/**
 * Batch number, derived from the order (there is no dedicated batch column). The reference sticker's
 * batch (e.g. 202609070003) is YYYYMMDD + a 4-digit sequence. We reconstruct it from the order's
 * placed date (YYYYMMDD) + the numeric tail of the order id (`BR-DDMMYYNN` -> NN, zero-padded to 4).
 */
function deriveBatchNumber(orderId: string, placed: { dd: string; mm: string; yyyy: string } | null): string {
  const seqMatch = orderId.match(/(\d{1,4})\s*$/);
  const seq = (seqMatch?.[1] ?? "").padStart(4, "0").slice(-4) || "0001";
  if (!placed) return seq;
  return `${placed.yyyy}${placed.mm}${placed.dd}${seq}`;
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

  // Auto-open the print dialog once the sticker is rendered (acts like Ctrl+P).
  useEffect(() => {
    if (order && !loading && allowed) {
      const timer = setTimeout(() => window.print(), 500);
      return () => clearTimeout(timer);
    }
  }, [order, loading, allowed]);

  if (permsLoading || !allowed) return null;
  if (loading && !order) return <PageSkeleton rows={3} />;
  if (error || !order) return <ErrorState message={error ?? t("common.orderNotFound")} onRetry={retry} />;

  const item = order.items[0];
  const size = parseSize(item?.sizeRequested ?? item?.size ?? item?.sizeStandard);
  const thicknessNum = parseThicknessNum(item?.thickness);
  const placed = parseDdMmYyyy(order.placedAt);

  const productName = item?.model ?? "—";
  // "BR ORTHO 5 INCH" style: product name + thickness in inches.
  const productTitle = thicknessNum != null ? `${productName} ${thicknessNum} INCH` : productName;

  // Size row: Length x Breadth x Thickness (inches), 2 decimals to match the label format.
  const sizeText = `${dim(size.length)} x ${dim(size.width)} x ${dim(thicknessNum)}`;
  const qty = Number(item?.quantity ?? order.totalItems ?? 1) || 1;
  const mrp = Number(item?.mrp ?? 0) || 0;
  const mfgOn = placed ? `${placed.mm}/${placed.yyyy}` : "—";
  const batchNo = deriveBatchNumber(order.id, placed);

  return (
    <div className="mrp-sticker-print">
      <style>{`
        @media print {
          /* Sticker page: 3.5in wide x 5.5in tall, no printer margins. */
          @page { size: 3.5in 5.5in; margin: 0; }
          body * { visibility: hidden; }
          #mrp-sticker, #mrp-sticker * { visibility: visible; }
          #mrp-sticker { position: absolute; left: 0; top: 0; }
        }
        #mrp-sticker {
          box-sizing: border-box;
          width: 3.5in;
          min-height: 5.5in;
          margin: 0 auto;
          padding: 0.18in 0.2in;
          background: #fff;
          color: #000;
          font-family: Arial, Helvetica, sans-serif;
          display: flex;
          flex-direction: column;
        }
        #mrp-sticker .st-header { display: flex; justify-content: flex-end; }
        #mrp-sticker .st-brand { text-align: right; line-height: 1; }
        #mrp-sticker .st-brand-name {
          font-weight: 800; font-size: 22px; color: #1c6fb8; letter-spacing: -0.5px;
        }
        #mrp-sticker .st-brand-sub { font-size: 9px; font-weight: 700; color: #1c6fb8; letter-spacing: 1px; }
        #mrp-sticker .st-brand-tag { font-size: 8px; font-weight: 700; color: #1c6fb8; letter-spacing: 1px; }
        #mrp-sticker .st-product {
          font-weight: 800; font-size: 20px; text-transform: uppercase; margin: 14px 0 12px;
        }
        #mrp-sticker table { width: 100%; border-collapse: collapse; }
        #mrp-sticker td {
          border: 1.5px solid #000; padding: 6px 8px; vertical-align: middle; font-size: 12px;
        }
        #mrp-sticker td.st-label { width: 44%; font-weight: 700; }
        #mrp-sticker td.st-label small { display: block; font-weight: 400; font-size: 9px; }
        #mrp-sticker td.st-value { font-weight: 700; font-size: 15px; }
        #mrp-sticker .st-footer { margin-top: auto; padding-top: 12px; text-align: center; }
        #mrp-sticker .st-footer .st-quality { font-size: 8px; font-weight: 700; letter-spacing: 1px; }
        #mrp-sticker .st-footer .st-company { font-size: 15px; font-weight: 800; color: #1c6fb8; }
        #mrp-sticker .st-footer .st-iso { font-size: 8px; font-weight: 600; }
        #mrp-sticker .st-footer .st-addr { font-size: 8px; margin-top: 4px; line-height: 1.35; }
      `}</style>

      <div id="mrp-sticker">
        {/* Header — bodyline brand mark */}
        <div className="st-header">
          <div className="st-brand">
            <div className="st-brand-name">bodyline</div>
            <div className="st-brand-sub">MATTRESS</div>
            <div className="st-brand-tag">SHAPE YOUR SLEEP</div>
          </div>
        </div>

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
              <td className="st-value">{qty} Nos</td>
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

        {/* Footer — manufacturer */}
        <div className="st-footer">
          <div className="st-quality">A QUALITY PRODUCT OF</div>
          <div className="st-company">Shree Sacha Foam Industries</div>
          <div className="st-iso">An ISO 9001-2015 Co.</div>
          <div className="st-addr">
            Shirishpada, Survey No. 54/1, at Kone Village, Wada, District Palghar – 421303
            <br />
            E-mail: info@sachafoam.com | Web: www.sachafoam.com
          </div>
        </div>
      </div>
    </div>
  );
}
