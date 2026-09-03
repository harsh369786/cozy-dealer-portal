export const IN_APP_NOTIFICATION_EVENT = "backrest:in-app-notification";

export type InAppNotificationAlert = {
  id: string;
  title: string;
  body: string;
  link?: string;
  metadata?: unknown;
};

export function emitInAppNotification(alert: InAppNotificationAlert) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(IN_APP_NOTIFICATION_EVENT, { detail: alert }));
}
