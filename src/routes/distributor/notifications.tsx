import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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

function NotificationsPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<NotificationCategory | "all">("all");
  const [items, setItems] = useState<Awaited<ReturnType<typeof getNotifications>>>([]);

  const filters = useMemo(
    (): { id: NotificationCategory | "all"; label: string }[] => [
      { id: "all", label: t("common.all") },
      { id: "orders", label: t("notifications.categories.orders") },
      { id: "campaigns", label: t("notifications.categories.campaigns") },
      { id: "complaints", label: t("notifications.categories.complaints") },
      { id: "system", label: t("notifications.categories.system") },
    ],
    [t],
  );

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
    <DistributorShell title={t("distributor.notifications.title")} back="/distributor/dashboard" showBell={false}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="scrollbar-none flex gap-2 overflow-x-auto scroll-smooth-touch pb-1">
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
          {t("common.markAllRead")}
        </Button>
      </div>

      {loading && <PageSkeleton rows={4} />}
      {error && <ErrorState message={error} onRetry={retry} />}
      {!loading && !error && items.length === 0 && (
        <EmptyState
          title={t("notifications.noNotifications")}
          description={t("notifications.allCaughtUp")}
        />
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
