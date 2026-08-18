import { useState } from "react";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const reasonSchema = z.string().trim().min(5, "Please provide a reason (at least 5 characters)");

const QUICK_REASONS = [
  "Incorrect size or dimensions",
  "Stock unavailable",
  "Pricing mismatch",
  "Duplicate order",
  "Customer cancelled",
];

export function RejectOrderDialog({
  open,
  onOpenChange,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  loading?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = () => {
    const result = reasonSchema.safeParse(reason);
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Invalid reason");
      return;
    }
    setError(null);
    onConfirm(result.data);
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      setReason("");
      setError(null);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reject Order</DialogTitle>
          <DialogDescription>
            A rejection reason is required. The dealer will see this on the order timeline.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {QUICK_REASONS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => {
                  setReason(chip);
                  setError(null);
                }}
                className={cn(
                  "rounded-full border border-border px-3 py-1.5 text-xs font-semibold transition-colors",
                  reason === chip && "border-primary bg-secondary",
                )}
              >
                {chip}
              </button>
            ))}
          </div>
          <Textarea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            placeholder="Enter rejection reason..."
            className="min-h-24 rounded-2xl"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleClose(false)} className="rounded-2xl">
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={loading}
            className="rounded-2xl"
          >
            Confirm Rejection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  loading,
  variant = "default",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  loading?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-2xl">
            Cancel
          </Button>
          <Button
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={loading}
            className="rounded-2xl"
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
