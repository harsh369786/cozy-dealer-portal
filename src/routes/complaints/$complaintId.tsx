import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import {
  complaintSteps,
  getOrderById,
  sampleComplaints,
  type Complaint,
  type ComplaintStatus,
} from "@/lib/demo-data";
import { getStoredComplaints } from "@/lib/notifications";

export const Route = createFileRoute("/complaints/$complaintId")({
  component: TrackComplaint,
});

function TrackComplaint() {
  const { complaintId } = Route.useParams();

  const stored = getStoredComplaints().find((c) => c.id === complaintId);
  const sample = sampleComplaints.find((c) => c.id === complaintId);

  const complaint: Complaint | null = sample
    ? sample
    : stored
      ? {
          id: stored.id,
          orderId: stored.orderId,
          description: stored.description,
          status: stored.status,
          submitted: stored.submitted,
          step: stored.step,
        }
      : null;

  if (!complaint) {
    return (
      <AppShell title="Complaint" back="/orders">
        <p className="text-center text-muted-foreground">Complaint not found.</p>
        <Link to="/orders" className="press mt-4 block text-center font-bold text-primary">
          Back to Orders
        </Link>
      </AppShell>
    );
  }

  const order = getOrderById(complaint.orderId);

  return (
    <AppShell title={`Complaint #${complaint.id}`} back="/orders">
      <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
        <p className="font-display text-lg font-bold">Complaint #{complaint.id}</p>
        <p className="mt-1 text-sm text-muted-foreground">Submitted {complaint.submitted}</p>
        <p className="mt-4 rounded-2xl bg-secondary/60 px-4 py-3 text-sm">
          {complaint.description}
        </p>
      </div>

      {order && (
        <div className="mt-4 rounded-3xl border border-border bg-card p-4">
          <p className="text-sm font-bold text-muted-foreground">Related Order</p>
          <p className="mt-1 font-bold">
            #{order.id} — {order.product}
          </p>
          <p className="text-sm text-muted-foreground">{order.detail}</p>
        </div>
      )}

      <p className="mt-6 text-sm font-bold">Complaint Status</p>
      <ol className="mt-3">
        {complaintSteps.map((s, idx) => {
          const done = idx < complaint.step;
          const current = idx === complaint.step;
          return (
            <li key={s} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "grid h-7 w-7 place-items-center rounded-full border-2 text-xs font-bold",
                    done && "border-transparent brand-gradient text-primary-foreground",
                    current && "border-primary text-primary",
                    !done && !current && "border-border text-muted-foreground",
                  )}
                >
                  {done ? <Check className="h-4 w-4" strokeWidth={3} /> : current ? "●" : ""}
                </span>
                {idx < complaintSteps.length - 1 && (
                  <span className={cn("w-0.5 flex-1", done ? "bg-primary" : "bg-border")} />
                )}
              </div>
              <span
                className={cn(
                  "pb-5 text-base",
                  done || current ? "font-bold" : "text-muted-foreground",
                )}
              >
                {s as ComplaintStatus}
              </span>
            </li>
          );
        })}
      </ol>
    </AppShell>
  );
}
