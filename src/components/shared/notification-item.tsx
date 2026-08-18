import { Link } from "@tanstack/react-router";
import type { DistributorNotification } from "@/lib/mock/distributor/types";
import { cn } from "@/lib/utils";

export function NotificationItem({
  notification,
  onRead,
}: {
  notification: DistributorNotification;
  onRead?: (id: string) => void;
}) {
  const content = (
    <>
      <div className="flex items-start gap-3">
        {!notification.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />}
        <div className={cn("min-w-0 flex-1", notification.read && "pl-5")}>
          <div className="flex items-center gap-2">
            <p className="font-semibold">{notification.title}</p>
            {notification.isReminder && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                Reminder
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{notification.body}</p>
          <p className="mt-1 text-xs text-muted-foreground">{notification.createdAt}</p>
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
        onClick={() => onRead?.(notification.id)}
        className={className}
      >
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
