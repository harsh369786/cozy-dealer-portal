import type { ReactNode } from "react";
import { AlertCircle, Inbox } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-secondary">
        <Icon className="h-7 w-7 text-muted-foreground" />
      </span>
      <p className="mt-4 font-display text-lg font-bold">{title}</p>
      {description && <p className="mt-1 max-w-xs text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();

  const title =
    message.includes("permission") || message.includes("Forbidden") || message.includes(t("errors.forbidden"))
      ? t("errors.accessRestricted")
      : message.includes("Not found") || message.includes(t("errors.notFound"))
        ? t("errors.notFound")
        : t("errors.somethingWentWrong");

  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-destructive/10">
        <AlertCircle className="h-7 w-7 text-destructive" />
      </span>
      <p className="mt-4 font-display text-lg font-bold">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button onClick={onRetry} className="mt-4 rounded-2xl" variant="outline">
          {t("common.tryAgain")}
        </Button>
      )}
    </div>
  );
}

export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="shimmer-line h-24 rounded-3xl bg-muted" />
      ))}
    </div>
  );
}
