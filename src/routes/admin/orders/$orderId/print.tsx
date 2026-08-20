import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { inr } from "@/lib/demo-data";
import { getOrder } from "@/services/admin/orders";

export const Route = createFileRoute("/admin/orders/$orderId/print")({
  component: PrintJobCardPage,
});

function PrintJobCardPage() {
  const { orderId } = Route.useParams();

  const { data: order, loading, error, retry } = useAsyncData(() => getOrder(orderId), [orderId]);

  useEffect(() => {
    if (order && !loading) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [order, loading]);

  if (loading) return <PageSkeleton rows={3} />;
  if (error || !order) return <ErrorState message={error ?? "Order not found"} onRetry={retry} />;

  return (
    <div className="print-job-card mx-auto max-w-2xl bg-white p-8 text-black">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-job-card, .print-job-card * { visibility: visible; }
          .print-job-card { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
      <header className="border-b-2 border-black pb-4">
        <h1 className="text-2xl font-bold">BackRest — Job Card</h1>
        <p className="text-sm">Order #{order.id}</p>
        <p className="text-sm">{order.placedAt}</p>
      </header>

      <section className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="font-bold">Dealer</p>
          <p>{order.dealerName}</p>
          <p>{order.dealerCode}</p>
        </div>
        <div>
          <p className="font-bold">Distributor</p>
          <p>{order.distributorName}</p>
        </div>
      </section>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black">
            <th className="py-2 text-left">Model</th>
            <th className="py-2 text-left">Size</th>
            <th className="py-2 text-right">Qty</th>
            <th className="py-2 text-right">Price</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, i) => (
            <tr key={i} className="border-b border-gray-300">
              <td className="py-2">{item.model}</td>
              <td className="py-2">
                {item.size} × {item.thickness}
              </td>
              <td className="py-2 text-right">{item.quantity}</td>
              <td className="py-2 text-right">
                <span className="line-through text-gray-500">{inr(item.mrp)}</span>{" "}
                {inr(item.campaignPrice ?? item.dealerPrice)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="mt-6 border-t-2 border-black pt-4 text-right font-bold">
        Total: {inr(order.totalValue)}
      </footer>
    </div>
  );
}
