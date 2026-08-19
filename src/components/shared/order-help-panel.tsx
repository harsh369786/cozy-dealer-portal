import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { toast } from "sonner";
import type { Order } from "@/lib/demo-data";
import { inr } from "@/lib/demo-data";
import {
  addComplaintNotification,
  generateComplaintId,
  saveComplaint,
  type StoredComplaint,
} from "@/lib/notifications";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}

export function OrderHelpPanel({
  order,
  onSubmitted,
}: {
  order: Order;
  onSubmitted?: (complaint: StoredComplaint) => void;
}) {
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState<StoredComplaint | null>(null);

  const submit = () => {
    if (!description.trim()) return;
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
    addComplaintNotification(complaint);
    toast.success("Help request submitted", {
      description: `Reference ${complaint.id} — we'll get back to you soon.`,
    });
    setSubmitted(complaint);
    onSubmitted?.(complaint);
  };

  if (submitted) {
    return (
      <div className="mt-4 rounded-2xl border border-primary/30 bg-secondary/50 p-4 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full brand-gradient">
          <Check className="h-6 w-6 text-primary-foreground" strokeWidth={3} />
        </div>
        <p className="mt-3 font-display font-bold">Help request submitted</p>
        <p className="mt-1 text-sm text-muted-foreground">Reference: {submitted.id}</p>
        <Link
          to="/complaints/$complaintId"
          params={{ complaintId: submitted.id }}
          className="press mt-3 inline-block text-sm font-bold text-primary"
        >
          Track status →
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-border bg-secondary/40 p-4">
      <div className="rounded-2xl border border-border bg-card p-3 text-sm">
        <div className="space-y-2">
          <Row label="Product" value={order.product} />
          <Row label="Size" value={order.size} />
          <Row label="Thickness" value={order.thickness} />
          <Row label="Quantity" value={String(order.quantity)} />
          <Row label="Status" value={order.status} />
          <Row label="Amount" value={inr(order.amount)} />
          {order.customer?.name && <Row label="Customer" value={order.customer.name} />}
          {order.customer?.mobile && <Row label="Mobile" value={order.customer.mobile} />}
        </div>
      </div>
      <div>
        <p className="text-sm font-bold">What do you need help with?</p>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the issue with this order…"
          className="mt-2 min-h-28 rounded-2xl text-base"
        />
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={!description.trim()}
        className={cn(
          "press h-12 w-full rounded-2xl text-base font-bold text-primary-foreground",
          description.trim() ? "brand-gradient" : "bg-muted text-muted-foreground",
        )}
      >
        Submit Help Request
      </button>
    </div>
  );
}
