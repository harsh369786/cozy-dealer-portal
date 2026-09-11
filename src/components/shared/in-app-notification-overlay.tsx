import { Link } from "@tanstack/react-router";
import { Bell, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IN_APP_NOTIFICATION_EVENT, type InAppNotificationAlert } from "@/lib/in-app-notifications";
import { localizeNotification } from "@/lib/localize-notification";
import { resolveDealerNotificationLink } from "@/lib/notification-links";
import {
  canShowAnnouncementPopup,
  recordPopupImpression,
  canShowPopupToday,
  recordPopupDaily,
} from "@/lib/notification-popup";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/lib/notifications";
import { markNotificationRead } from "@/services/notifications";

function NotificationOpenLink({
  link,
  className,
  onClick,
  children,
}: {
  link: string;
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  if (link.startsWith("/distributor/") || link.startsWith("/admin/")) {
    return (
      <a href={link} className={className} onClick={onClick}>
        {children}
      </a>
    );
  }
  const resolved = resolveDealerNotificationLink(link);
  return (
    <Link
      to={resolved.to}
      {...(resolved.params ? { params: resolved.params } : {})}
      {...(resolved.search ? { search: resolved.search } : {})}
      className={className}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}

function OverlayShell({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-foreground/50 p-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="animate-pop relative my-auto w-full max-w-[380px] overflow-hidden rounded-3xl border border-border bg-card shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function announcementMeta(detail: InAppNotificationAlert) {
  return (detail.metadata ?? {}) as Record<string, unknown>;
}

function shouldQueuePopup(detail: InAppNotificationAlert): boolean {
  const meta = announcementMeta(detail);
  if (meta['popupEnabled'] !== true) return false;
  // New model: cap "N times per day" per send event. Fall back to the legacy lifetime cap
  // (by notification id) for older announcements that carry no sendEventId / popupMaxPerDay.
  const sendEventId = typeof meta['sendEventId'] === "string" ? (meta['sendEventId'] as string) : null;
  if (sendEventId) {
    const perDay = Number(meta['popupMaxPerDay'] ?? 1) || 1;
    return canShowPopupToday(sendEventId, perDay);
  }
  return canShowAnnouncementPopup(detail.id, Number(meta['maxImpressions'] ?? 0));
}

/** Campaign / announcement popups only — order events use system push + inbox. */
export function InAppNotificationOverlay() {
  const { t } = useTranslation();
  const [queue, setQueue] = useState<InAppNotificationAlert[]>([]);
  const recordedImpressions = useRef(new Set<string>());
  const current = queue[0] ?? null;

  useEffect(() => {
    const onAlert = (event: Event) => {
      const detail = (event as CustomEvent<InAppNotificationAlert>).detail;
      if (!detail?.id) return;
      if (!shouldQueuePopup(detail)) return;
      setQueue((prev) => (prev.some((item) => item.id === detail.id) ? prev : [...prev, detail]));
    };
    window.addEventListener(IN_APP_NOTIFICATION_EVENT, onAlert);
    return () => window.removeEventListener(IN_APP_NOTIFICATION_EVENT, onAlert);
  }, []);

  useEffect(() => {
    if (!current) return;
    const meta = announcementMeta(current);
    if (meta['popupEnabled'] === true && !recordedImpressions.current.has(current.id)) {
      recordedImpressions.current.add(current.id);
      const sendEventId = typeof meta['sendEventId'] === "string" ? (meta['sendEventId'] as string) : null;
      if (sendEventId) recordPopupDaily(sendEventId);
      else recordPopupImpression(current.id);
    }
  }, [current]);

  if (!current) return null;

  const localized = localizeNotification(current, t);
  const dismiss = () => setQueue((prev) => prev.slice(1));
  const open = () => {
    void markNotificationRead(current.id);
    dismiss();
  };

  return (
    <OverlayShell onClose={dismiss}>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("common.close")}
        className="press absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-secondary"
      >
        <X className="h-5 w-5" />
      </button>
      <div className="brand-gradient px-6 py-7 text-center text-primary-foreground">
        <Bell className="mx-auto h-8 w-8" />
        <p className="mt-2 font-display text-xl font-bold">{t("common.notifications")}</p>
      </div>
      <div className="p-6 text-center">
        <p className="font-display text-xl font-bold">{localized.title}</p>
        <p className="mt-2 text-sm text-muted-foreground">{localized.body}</p>
        {current.link ? (
          <NotificationOpenLink
            link={current.link}
            onClick={open}
            className="press mt-6 block rounded-2xl brand-gradient py-4 text-base font-bold text-primary-foreground"
          >
            {t("common.open")}
          </NotificationOpenLink>
        ) : null}
        <button
          type="button"
          onClick={dismiss}
          className="press mt-3 w-full py-3 text-sm font-bold text-muted-foreground"
        >
          {t("common.later")}
        </button>
      </div>
    </OverlayShell>
  );
}

export function NotificationInboxOverlay({
  notifications,
  loading,
  onClose,
  onMarkRead,
}: {
  notifications: AppNotification[];
  loading?: boolean;
  onClose: () => void;
  onMarkRead: (id: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <OverlayShell onClose={onClose}>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("common.close")}
        className="press absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-secondary"
      >
        <X className="h-5 w-5" />
      </button>
      <div className="border-b border-border px-6 py-5 pr-14">
        <p className="font-display text-xl font-bold">{t("common.notifications")}</p>
      </div>
      <div className="max-h-[60vh] space-y-2 overflow-y-auto p-3">
        {loading ? (
          <>
            <div className="h-16 animate-pulse rounded-2xl bg-secondary/80" aria-hidden />
            <div className="h-16 animate-pulse rounded-2xl bg-secondary/80" aria-hidden />
          </>
        ) : notifications.length > 0 ? (
          notifications.map((n) => {
            const localized = localizeNotification(n, t);
            return (
              <div
                key={n.id}
                className={cn("rounded-2xl border border-border p-3", !n.read && "bg-secondary/60")}
              >
                <p className="text-sm font-bold">{localized.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{localized.body}</p>
                <NotificationOpenLink
                  link={n.link}
                  onClick={() => {
                    onMarkRead(n.id);
                    onClose();
                  }}
                  className="mt-2 inline-block text-xs font-bold text-primary"
                >
                  {t("common.open")}
                </NotificationOpenLink>
              </div>
            );
          })
        ) : (
          <p className="p-4 text-center text-sm text-muted-foreground">{t("distributor.noNotifications")}</p>
        )}
      </div>
    </OverlayShell>
  );
}
