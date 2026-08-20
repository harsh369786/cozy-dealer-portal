import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireRoles } from "@/lib/auth-guard";
import { cn } from "@/lib/utils";
import { complaintSteps, type Complaint, type ComplaintStatus } from "@/lib/demo-data";
import { getComplaints } from "@/services/complaints";
import type { ComplaintStatus as ApiComplaintStatus } from "@/lib/mock/distributor/types";
import { getOrderById } from "@/services/orders";
import type { DistributorOrder } from "@/lib/mock/distributor/types";

export const Route = createFileRoute("/complaints/$complaintId")({
  beforeLoad: () => requireRoles(["dealer"]),
  component: TrackComplaint,
});

function TrackComplaint() {
  const { complaintId } = Route.useParams();
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [order, setOrder] = useState<DistributorOrder | null>(null);

  useEffect(() => {
    getComplaints()
      .then((list) => {
        const found = list.find((c) => c.id === complaintId);
        if (!found) {
          setComplaint(null);
          return;
        }
        setComplaint({
          id: found.id,
          orderId: found.orderId,
          description: found.description,
          status: mapStatus(found.status),
          submitted: found.createdAt,
          step: complaintStepIndex(found.status as ApiComplaintStatus),
        });
        return getOrderById(found.orderId);
      })
      .then((o) => {
        if (o) setOrder(o);
      })
      .catch(() => setComplaint(null));
  }, [complaintId]);

  if (!complaint) {
    return (
      <AppShell title="Help Request" back="/complaints">
        <p className="text-muted-foreground">Help request not found.</p>
        <Link to="/complaints" className="mt-4 block text-sm font-bold text-primary">
          Back to all requests
        </Link>
      </AppShell>
    );
  }

  const apiStatus = reverseMapStatus(complaint.status);

  return (
    <AppShell title="Track Help Request" back="/complaints">
      <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-display text-lg font-bold">{complaint.id}</p>
            <p className="mt-1 text-sm text-muted-foreground">Order #{complaint.orderId}</p>
          </div>
          <StatusBadge kind="complaint" status={apiStatus} />
        </div>
        <p className="mt-4 text-sm">{complaint.description}</p>
        <p className="mt-2 text-xs text-muted-foreground">Submitted {complaint.submitted}</p>
        {order && order.items[0] && (
          <p className="mt-3 text-sm text-muted-foreground">
            {order.items[0].model} · {order.items[0].size} × {order.items[0].thickness}
          </p>
        )}
      </div>

      <p className="mt-6 text-sm font-bold">Status</p>
      <ol className="mt-3">
        {complaintSteps.map((s, idx) => {
          const done = idx <= complaint.step;
          return (
            <li key={s} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "grid h-7 w-7 place-items-center rounded-full border-2 text-xs font-bold",
                    done && "border-transparent brand-gradient text-primary-foreground",
                    !done && "border-border text-muted-foreground",
                  )}
                >
                  {done ? <Check className="h-4 w-4" strokeWidth={3} /> : ""}
                </span>
                {idx < complaintSteps.length - 1 && (
                  <span className={cn("w-0.5 flex-1", done ? "bg-primary" : "bg-border")} />
                )}
              </div>
              <span className={cn("pb-5 text-base", done ? "font-bold" : "text-muted-foreground")}>
                {s}
              </span>
            </li>
          );
        })}
      </ol>

      {order && (
        <Link
          to="/orders/$orderId"
          params={{ orderId: order.id }}
          className="press mt-2 block rounded-2xl border border-border bg-secondary py-3 text-center text-sm font-bold"
        >
          View order details
        </Link>
      )}
    </AppShell>
  );
}

function mapStatus(status: string): ComplaintStatus {
  const map: Record<string, ComplaintStatus> = {
    pending: "Pending",
    in_progress: "In Progress",
    resolved: "Resolved",
    rejected: "Closed",
  };
  return map[status] ?? "Pending";
}

function reverseMapStatus(status: ComplaintStatus): ApiComplaintStatus {
  const map: Record<ComplaintStatus, ApiComplaintStatus> = {
    Pending: "pending",
    "Under Review": "in_progress",
    "In Progress": "in_progress",
    Resolved: "resolved",
    Closed: "rejected",
  };
  return map[status] ?? "pending";
}

function complaintStepIndex(status: ApiComplaintStatus): number {
  switch (status) {
    case "pending":
      return 0;
    case "in_progress":
      return 2;
    case "resolved":
      return 3;
    case "rejected":
      return 4;
    default:
      return 0;
  }
}
