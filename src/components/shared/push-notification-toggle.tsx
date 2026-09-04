import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import {
  getNotificationPermission,
  getServerPushStatus,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/browser-notifications";

export function PushNotificationToggle({ className }: { className?: string }) {
  const supported = isPushSupported();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!supported) {
        setLoading(false);
        return;
      }
      try {
        // Reflect DB reality, not just the browser: the toggle is ON only when the browser has
        // a live subscription, permission is granted, AND the server has a matching row.
        const registration = await navigator.serviceWorker.ready;
        const [sub, serverStatus] = await Promise.all([
          registration.pushManager.getSubscription(),
          getServerPushStatus(),
        ]);
        const browserOk = Boolean(sub) && getNotificationPermission() === "granted";
        if (!cancelled) setEnabled(browserOk && Boolean(serverStatus?.subscribed));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [supported]);

  if (!supported) return null;

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <Label htmlFor="push-toggle" className="font-semibold">
            Push notifications
          </Label>
          <p className="mt-1 text-sm text-muted-foreground">
            Receive alerts for orders, rewards and updates on this device.
          </p>
        </div>
        <Switch
          id="push-toggle"
          checked={enabled}
          disabled={loading || getNotificationPermission() === "denied"}
          onCheckedChange={(checked) => {
            setLoading(true);
            void (async () => {
              try {
                if (checked) {
                  // Only flip ON if a real subscription was created + saved to the server.
                  // subscribeToPush() surfaces its own error toast on failure and returns false.
                  const ok = await subscribeToPush();
                  setEnabled(ok);
                } else {
                  await unsubscribeFromPush();
                  setEnabled(false);
                }
              } finally {
                setLoading(false);
              }
            })();
          }}
        />
      </div>
      {getNotificationPermission() === "denied" && (
        <p className="mt-2 text-xs text-muted-foreground">
          Notifications are blocked in your browser settings. Enable them there to use push alerts.
        </p>
      )}
    </div>
  );
}
