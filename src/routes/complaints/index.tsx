import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import { getOrderById, inr } from "@/lib/demo-data";
import {
  generateComplaintId,
  getStoredComplaints,
  saveComplaint,
  type StoredComplaint,
} from "@/lib/notifications";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/complaints/")({
  head: () => ({
    meta: [
      { title: "Complaints — BackRest Dealer App" },
      {
        name: "description",
        content: "Report an issue with a BackRest order quickly using your order number.",
      },
    ],
  }),
  component: ComplaintsPage,
});

function ComplaintsPage() {
  const [orderId, setOrderId] = useState("");
  const [order, setOrder] = useState<ReturnType<typeof getOrderById>>(null);
  const [notFound, setNotFound] = useState(false);
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState<StoredComplaint | null>(null);

  const findOrder = () => {
    const found = getOrderById(orderId);
    setOrder(found);
    setNotFound(!found);
    setSubmitted(null);
  };

  const submit = () => {
    if (!order || !description.trim()) return;
    const complaint: StoredComplaint = {
      id: generateComplaintId(),
      orderId: order.id,
      description: description.trim(),
      status: "Pending",
      submitted: new Date().toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      step: 0,
    };
    saveComplaint(complaint);
    setSubmitted(complaint);
  };

  if (submitted) {
    return (
      <AppShell title="Complaint Submitted" back="/complaints">
        <div className="grid min-h-[60vh] place-items-center text-center">
          <div className="w-full">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full brand-gradient">
              <Check className="h-10 w-10 text-primary-foreground" strokeWidth={3} />
            </div>
            <h2 className="mt-6 font-display text-2xl font-bold">
              Complaint Submitted Successfully ✓
            </h2>
            <p className="mt-3 font-display text-xl font-bold">Complaint Number: {submitted.id}</p>
            <p className="mt-2 text-base font-semibold">Status: Pending</p>
            <Link
              to="/complaints/$complaintId"
              params={{ complaintId: submitted.id }}
              className="press mt-8 block rounded-2xl brand-gradient px-8 py-4 text-lg font-bold text-primary-foreground"
            >
              Track Complaint
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Complaints" back="/campaigns">
      <p className="text-sm text-muted-foreground">
        Enter your order number to report an issue. We'll pull up the details automatically.
      </p>

      <div className="mt-5">
        <p className="text-base font-bold">Order ID</p>
        <div className="mt-3 flex gap-2">
          <input
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder="e.g. BR1024"
            className="h-14 flex-1 rounded-2xl border border-input bg-card px-4 text-base font-semibold outline-none focus:border-ring"
          />
          <button
            onClick={findOrder}
            className="press grid h-14 w-14 shrink-0 place-items-center rounded-2xl brand-gradient text-primary-foreground"
            aria-label="Find order"
          >
            <Search className="h-6 w-6" />
          </button>
        </div>
        <button
          onClick={findOrder}
          className="press mt-3 h-14 w-full rounded-2xl brand-gradient text-base font-bold text-primary-foreground"
        >
          Find Order
        </button>
        {notFound && (
          <p className="mt-2 text-sm font-semibold text-destructive">
            Order not found. Try BR1024, BR1019 or BR0998.
          </p>
        )}
      </div>

      {order && (
        <div className="animate-rise mt-6 space-y-5">
          <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
            <p className="text-xs font-bold uppercase text-muted-foreground">Order Details</p>
            <p className="mt-2 font-display text-lg font-bold">Order #{order.id}</p>
            <p className="text-sm text-muted-foreground">Placed {order.placed}</p>
            <div className="mt-4 space-y-2 text-sm">
              <Row label="Product" value={order.product} />
              <Row label="Size" value={order.size} />
              <Row label="Thickness" value={order.thickness} />
              <Row label="Quantity" value={String(order.quantity)} />
              <Row label="Dealer" value={order.dealer} />
              <Row label="Status" value={order.status} />
              <Row label="Amount" value={inr(order.amount)} />
              {order.customer?.name && <Row label="Customer" value={order.customer.name} />}
              {order.customer?.mobile && <Row label="Mobile" value={order.customer.mobile} />}
            </div>
          </div>

          <div>
            <p className="text-base font-bold">What's the Problem?</p>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Please explain the problem with the product/order…"
              className="mt-3 min-h-36 rounded-2xl text-base"
            />
          </div>

          <button
            onClick={submit}
            disabled={!description.trim()}
            className={cn(
              "press h-16 w-full rounded-2xl text-lg font-bold text-primary-foreground",
              description.trim() ? "brand-gradient" : "bg-secondary text-muted-foreground",
            )}
          >
            Submit Complaint
          </button>
        </div>
      )}

      {getStoredComplaints().length > 0 && (
        <div className="mt-8">
          <p className="mb-3 font-display text-base font-bold">Your Recent Complaints</p>
          <div className="space-y-2">
            {getStoredComplaints()
              .slice(0, 3)
              .map((c) => (
                <Link
                  key={c.id}
                  to="/complaints/$complaintId"
                  params={{ complaintId: c.id }}
                  className="press block rounded-2xl border border-border bg-card px-4 py-3"
                >
                  <p className="font-bold">{c.id}</p>
                  <p className="text-xs text-muted-foreground">
                    Order {c.orderId} · {c.status}
                  </p>
                </Link>
              ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}
