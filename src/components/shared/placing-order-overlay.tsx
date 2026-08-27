import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export function PlacingOrderOverlay({ message }: { message?: string }) {
  const { t } = useTranslation();
  const title = message ?? t("common.placingOrder");

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/60 p-5 backdrop-blur-sm"
      role="alertdialog"
      aria-busy="true"
      aria-live="polite"
      aria-label={title}
    >
      <div className="animate-rise w-full max-w-sm rounded-3xl border border-border bg-card px-8 py-10 text-center shadow-lift">
        <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" strokeWidth={2.25} />
        <p className="mt-5 font-display text-xl font-bold">{title}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t("common.placingOrderWait")}</p>
      </div>
    </div>
  );
}
