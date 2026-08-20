import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { toast } from "sonner";
import type { DealerOrderListItem } from "@/services/orders";
import { inr } from "@/lib/demo-data";
import { submitComplaint } from "@/services/complaints";
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
  order: DealerOrderListItem;
  onSubmitted?: (complaintId: string) => void;
}) {
  const [description, setDescription] = useState("");
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const submit = async () => {
    if (!description.trim()) return;
    try {
      const res = await submitComplaint({
        orderId: order.id,
        description: description.trim(),
      });
      toast.success("Help request submitted", {
        description: `Reference ${res.id} — we'll get back to you soon.`,
      });
      setSubmittedId(res.id);
      onSubmitted?.(res.id);
    } catch {
      toast.error("Could not submit help request");
    }
  };

  if (submittedId) {
    return (
      <div className="mt-4 rounded-2xl border border-primary/30 bg-secondary/50 p-4 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full brand-gradient">
          <Check className="h-6 w-6 text-primary-foreground" strokeWidth={3} />
        </div>
        <p className="mt-3 font-display font-bold">Help request submitted</p>
        <p className="mt-1 text-sm text-muted-foreground">Reference: {submittedId}</p>
        <Link
          to="/complaints/$complaintId"
          params={{ complaintId: submittedId }}
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
          <Row label="Order" value={`#${order.id}`} />
          <Row label="Product" value={order.product} />
          <Row label="Detail" value={order.detail} />
          <Row label="Amount" value={inr(order.amount)} />
        </div>
      </div>

      <div>
        <p className="text-sm font-bold">Describe the issue</p>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What's wrong with this order?"
          className="mt-2 min-h-[100px] rounded-2xl"
        />
      </div>

      <button
        onClick={submit}
        disabled={!description.trim()}
        className={cn(
          "press h-12 w-full rounded-2xl text-sm font-bold",
          description.trim()
            ? "brand-gradient text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        Submit Help Request
      </button>
    </div>
  );
}
