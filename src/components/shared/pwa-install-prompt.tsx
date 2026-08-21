import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "backrest-pwa-install-dismissed";
const DISMISS_DAYS = 7;

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isDismissed(): boolean {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  if (raw === "1") return true; // legacy forever dismiss
  const dismissedAt = Number(raw);
  if (!Number.isFinite(dismissedAt)) return false;
  const ms = DISMISS_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() - dismissedAt < ms;
}

function dismissPrompt() {
  localStorage.setItem(DISMISS_KEY, String(Date.now()));
}

type PromptMode = "native" | "ios" | "manual";

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<PromptMode | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;
    if (isDismissed()) return;

    let cancelled = false;

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (cancelled) return;
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setMode("native");
    };

    const onInstalled = () => {
      setMode(null);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // iOS never fires beforeinstallprompt — show manual steps instead.
    if (isIos()) {
      const timer = window.setTimeout(() => {
        if (!cancelled) setMode("ios");
      }, 2000);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
        window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
        window.removeEventListener("appinstalled", onInstalled);
      };
    }

    // Chrome/Android: if the event never fires, show menu instructions after a visit.
    const fallbackTimer = window.setTimeout(() => {
      if (!cancelled) setMode((current) => current ?? "manual");
    }, 8000);

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!mode) return null;

  const close = () => {
    dismissPrompt();
    setMode(null);
    setDeferredPrompt(null);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 p-4 shadow-lg backdrop-blur supports-[padding:max(0px)]:pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-lg items-start gap-3">
        <img src="/icons/icon-192.png" alt="" className="size-12 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Install BackRest</p>
          {mode === "native" && deferredPrompt ? (
            <>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Add the app to your home screen for faster access and offline support.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    await deferredPrompt.prompt();
                    const choice = await deferredPrompt.userChoice;
                    setMode(null);
                    setDeferredPrompt(null);
                    if (choice.outcome === "dismissed") dismissPrompt();
                  }}
                >
                  <Download className="size-4" />
                  Install
                </Button>
                <Button size="sm" variant="outline" onClick={close}>
                  <X className="size-4" />
                  Not now
                </Button>
              </div>
            </>
          ) : mode === "ios" ? (
            <>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Tap <Share className="inline size-3.5 align-text-bottom" /> Share, then{" "}
                <strong>Add to Home Screen</strong> to install BackRest.
              </p>
              <div className="mt-3">
                <Button size="sm" variant="outline" onClick={close}>
                  <X className="size-4" />
                  Got it
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Open your browser menu (⋮) and choose <strong>Install app</strong> or{" "}
                <strong>Add to Home screen</strong>.
              </p>
              <div className="mt-3">
                <Button size="sm" variant="outline" onClick={close}>
                  <X className="size-4" />
                  Got it
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
    appinstalled: Event;
  }
}
