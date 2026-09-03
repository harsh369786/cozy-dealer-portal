import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { DistributorNotification } from "@/lib/mock/distributor/types";
import { useFormat } from "@/hooks/use-format";
import { localizeNotification } from "@/lib/localize-notification";
import { cn } from "@/lib/utils";

export function NotificationItem({
  notification,
  onRead,
}: {
  notification: DistributorNotification;
  onRead?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { formatTimestamp } = useFormat();
  const localized = localizeNotification(notification, t);
  const content = (
    <>
      <div className="flex items-start gap-3">
        {!notification.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />}
        <div className={cn("min-w-0 flex-1", notification.read && "pl-5")}>
          <div className="flex items-center gap-2">
            <p className="font-semibold">{localized.title}</p>
            {notification.isReminder && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                {t("common.reminder")}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{localized.body}</p>
          <p className="mt-1 text-xs text-muted-foreground">{formatTimestamp(notification.createdAt)}</p>
        </div>
      </div>
    </>
  );

  const className = cn(
    "press block rounded-2xl border border-border bg-card p-4",
    !notification.read && "border-primary/30 bg-secondary/40",
  );

  if (notification.link.startsWith("/distributor/orders/")) {
    const orderId = notification.link.split("/").pop()!;
    return (
      <Link
        to="/distributor/orders/$orderId"
        params={{ orderId }}
        onClick={() => onRead?.(notification.id)}
        className={className}
      >
        {content}
      </Link>
    );
  }

  if (notification.link.startsWith("/distributor/complaints/")) {
    const complaintId = notification.link.split("/").pop()!;
    return (
      <Link
        to="/distributor/complaints/$complaintId"
        params={{ complaintId }}
        onClick={() => onRead?.(notification.id)}
        className={className}
      >
        {content}
      </Link>
    );
  }

  if (notification.link.startsWith("/distributor/campaigns/")) {
    const campaignId = notification.link.split("/").pop()!;
    return (
      <Link
        to="/distributor/campaigns/$campaignId"
        params={{ campaignId }}
        onClick={() => onRead?.(notification.id)}
        className={className}
      >
        {content}
      </Link>
    );
  }

  if (notification.link === "/distributor/dashboard") {
    return (
      <Link
        to="/distributor/dashboard"
        onClick={() => onRead?.(notification.id)}
        className={className}
      >
        {content}
      </Link>
    );
  }

  if (notification.link === "/distributor/notifications") {
    return (
      <Link
        to="/distributor/notifications"
        onClick={() => onRead?.(notification.id)}
        className={className}
      >
        {content}
      </Link>
    );
  }

  if (notification.link === "/distributor/rewards" || notification.link.startsWith("/distributor/rewards")) {
    return (
      <Link
        to="/distributor/rewards"
        onClick={() => onRead?.(notification.id)}
        className={className}
      >
        {content}
      </Link>
    );
  }

  if (notification.link === "/distributor/reports") {
    return (
      <Link
        to="/distributor/reports"
        onClick={() => onRead?.(notification.id)}
        className={className}
      >
        {content}
      </Link>
    );
  }

  if (notification.link.startsWith("/distributor/dealers/")) {
    const dealerId = notification.link.split("/").pop()!;
    return (
      <Link
        to="/distributor/dealers/$dealerId"
        params={{ dealerId }}
        search={{ tab: undefined }}
        onClick={() => onRead?.(notification.id)}
        className={className}
      >
        {content}
      </Link>
    );
  }

  if (notification.link.startsWith("/admin/orders/")) {
    const orderId = notification.link.split("/").pop()!;
    return (
      <Link
        to="/admin/orders/$orderId"
        params={{ orderId }}
        onClick={() => onRead?.(notification.id)}
        className={className}
      >
        {content}
      </Link>
    );
  }

  if (notification.link.startsWith("/admin/complaints/")) {
    const complaintId = notification.link.split("/").pop()!;
    return (
      <Link
        to="/admin/complaints/$complaintId"
        params={{ complaintId }}
        onClick={() => onRead?.(notification.id)}
        className={className}
      >
        {content}
      </Link>
    );
  }

  if (notification.link.startsWith("/admin/rewards")) {
    const to = notification.link.includes("/claims") ? "/admin/rewards/claims" : "/admin/rewards";
    return (
      <Link to={to} onClick={() => onRead?.(notification.id)} className={className}>
        {content}
      </Link>
    );
  }

  if (notification.link.startsWith("/admin/visits/")) {
    const visitId = notification.link.split("/").pop()!;
    return (
      <Link
        to="/admin/visits/$visitId"
        params={{ visitId }}
        onClick={() => onRead?.(notification.id)}
        className={className}
      >
        {content}
      </Link>
    );
  }

  if (notification.link.startsWith("/admin/users")) {
    const query = notification.link.includes("?") ? notification.link.split("?")[1] : "";
    const tab = new URLSearchParams(query).get("tab") ?? "all";
    return (
      <Link
        to="/admin/users"
        search={{ tab }}
        onClick={() => onRead?.(notification.id)}
        className={className}
      >
        {content}
      </Link>
    );
  }

  if (notification.link === "/admin/notifications" || notification.link.startsWith("/admin/notifications")) {
    return (
      <Link to="/admin/notifications" onClick={() => onRead?.(notification.id)} className={className}>
        {content}
      </Link>
    );
  }

  if (notification.link === "/admin" || notification.link.startsWith("/admin/")) {
    return (
      <Link to="/admin" onClick={() => onRead?.(notification.id)} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <div className={className} onClick={() => onRead?.(notification.id)} role="button" tabIndex={0}>
      {content}
    </div>
  );
}
