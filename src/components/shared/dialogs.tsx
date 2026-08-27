import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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

const QUICK_REASON_KEYS = [
  "distributor.rejectDialog.quickReasons.incorrectSize",
  "distributor.rejectDialog.quickReasons.stockUnavailable",
  "distributor.rejectDialog.quickReasons.pricingMismatch",
  "distributor.rejectDialog.quickReasons.duplicateOrder",
  "distributor.rejectDialog.quickReasons.customerCancelled",
] as const;

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
  const { t } = useTranslation();
  const reasonSchema = useMemo(
    () => z.string().trim().min(5, t("errors.provideReasonMin5")),
    [t],
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const quickReasons = useMemo(
    () => QUICK_REASON_KEYS.map((key) => t(key)),
    [t],
  );

  const handleConfirm = () => {
    const result = reasonSchema.safeParse(reason);
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? t("errors.invalidReason"));
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
      <DialogContent className="scrollbar-none max-h-[90vh] overflow-y-auto scroll-smooth-touch rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("distributor.rejectDialog.title")}</DialogTitle>
          <DialogDescription>{t("distributor.rejectDialog.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {quickReasons.map((chip) => (
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
            placeholder={t("common.rejectionReasonPlaceholder")}
            className="min-h-24 rounded-2xl"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleClose(false)} className="rounded-2xl">
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={loading}
            className="rounded-2xl"
          >
            {t("distributor.rejectDialog.confirmRejection")}
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
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-2xl">
            {t("common.cancel")}
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
