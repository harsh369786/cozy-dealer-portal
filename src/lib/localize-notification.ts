import type { TFunction } from "i18next";

export type NotificationI18nMeta = {
  titleKey: string;
  bodyKey: string;
  params?: Record<string, string | number>;
};

export function parseNotificationMetadata(
  metadata: unknown,
): NotificationI18nMeta | null {
  if (!metadata || typeof metadata !== "object") return null;
  const i18n = (metadata as { i18n?: NotificationI18nMeta }).i18n;
  if (!i18n?.titleKey || !i18n?.bodyKey) return null;
  return i18n;
}

export function localizeNotification(
  notification: {
    title: string;
    body: string;
    metadata?: unknown;
  },
  t: TFunction,
): { title: string; body: string } {
  const meta = parseNotificationMetadata(notification.metadata);
  if (!meta) {
    return { title: notification.title, body: notification.body };
  }
  return {
    title: t(meta.titleKey, meta.params ?? {}),
    body: t(meta.bodyKey, meta.params ?? {}),
  };
}
