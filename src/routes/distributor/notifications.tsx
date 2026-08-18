import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DistributorShell } from "@/components/distributor-shell";
import { NotificationItem } from "@/components/shared/notification-item";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { useAsyncData } from "@/hooks/use-async-data";
import {
  getNotifications,
  getNotificationsByCategory,
  markAllRead,
  markNotificationRead,
} from "@/services/notifications";
import type { NotificationCategory } from "@/lib/mock/distributor/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/distributor/notifications")({
  component: NotificationsPage,
});

const filters: { id: NotificationCategory | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "orders", label: "Orders" },
  { id: "campaigns", label: "Campaigns" },
  { id: "complaints", label: "Complaints" },
  { id: "system", label: "System" },
];

function NotificationsPage() {
  const [filter, setFilter] = useState<NotificationCategory | "all">("all");
  const [items, setItems] = useState<Awaited<ReturnType<typeof getNotifications>>>([]);

  const { loading, error, retry } = useAsyncData(async () => {
    const data =
      filter === "all" ? await getNotifications() : await getNotificationsByCategory(filter);
    setItems(data);
    return data;
  }, [filter]);

  const handleRead = async (id: string) => {
    await markNotificationRead(id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const handleMarkAll = async () => {
    await markAllRead();
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <DistributorShell title="Notifications" back="/distributor/dashboard" showBell={false}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "press shrink-0 rounded-full px-3 py-1.5 text-xs font-bold",
                filter === f.id ? "bg-primary text-primary-foreground" : "bg-secondary",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={handleMarkAll} className="shrink-0 text-xs">
          Mark all read
        </Button>
      </div>

      {loading && <PageSkeleton rows={4} />}
      {error && <ErrorState message={error} onRetry={retry} />}
      {!loading && !error && items.length === 0 && (
        <EmptyState title="No notifications" description="You're all caught up." />
      )}
      {!loading && !error && items.length > 0 && (
        <div className="space-y-2">
          {items.map((n) => (
            <NotificationItem key={n.id} notification={n} onRead={handleRead} />
          ))}
        </div>
      )}
    </DistributorShell>
  );
}
