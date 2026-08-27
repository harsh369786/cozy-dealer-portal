import { Bell, PackageCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  dismissPushPrompt,
  getNotificationPermission,
  isPushSupported,
  PUSH_PROMPT_EVENT,
  subscribeToPush,
  type PushPromptReason,
} from "@/lib/browser-notifications";

const COPY: Record<
  PushPromptReason,
  { title: string; description: string; cta: string; icon: typeof Bell }
> = {
  first_order: {
    title: "Your order is placed — get live updates",
    description:
      "Turn on notifications to know instantly when your order is approved, in production, out for delivery, and delivered — even when this app is closed.",
    cta: "Turn on notifications",
    icon: PackageCheck,
  },
  session_start: {
    title: "Never miss an important update",
    description:
      "Enable notifications for new orders, complaints, reward claims, and status changes — delivered to this device even when the app is in the background.",
    cta: "Turn on notifications",
    icon: Bell,
  },
};

export function PushNotificationPrompt() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<PushPromptReason>("session_start");
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    if (!isPushSupported() || getNotificationPermission() !== "default") return;

    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ reason?: PushPromptReason }>).detail;
      setReason(detail?.reason ?? "session_start");
      setOpen(true);
    };

    window.addEventListener(PUSH_PROMPT_EVENT, onRequest);
    return () => window.removeEventListener(PUSH_PROMPT_EVENT, onRequest);
  }, []);

  if (!isPushSupported() || getNotificationPermission() !== "default") return null;

  const copy = COPY[reason];
  const Icon = copy.icon;

  const close = () => {
    dismissPushPrompt();
    setOpen(false);
  };

  const enable = async () => {
    setEnabling(true);
    try {
      const ok = await subscribeToPush();
      if (ok) setOpen(false);
    } finally {
      setEnabling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-[min(100vw-2rem,26rem)] gap-0 overflow-hidden rounded-3xl border-border p-0">
        <div className="brand-gradient px-6 pb-8 pt-8 text-primary-foreground">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-white/20 backdrop-blur-sm">
            <Icon className="h-8 w-8" strokeWidth={2.25} />
          </div>
          <DialogHeader className="mt-5 space-y-2 text-left text-primary-foreground">
            <DialogTitle className="font-display text-xl font-bold leading-snug text-primary-foreground">
              {copy.title}
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-primary-foreground/90">
              {copy.description}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-3 bg-card px-6 py-5">
          <Button
            className="h-12 w-full rounded-2xl text-base font-bold"
            disabled={enabling}
            onClick={() => void enable()}
          >
            {enabling ? "Enabling…" : copy.cta}
          </Button>
          <Button
            variant="ghost"
            className="h-11 w-full rounded-2xl font-semibold text-muted-foreground"
            disabled={enabling}
            onClick={close}
          >
            Not now
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Your browser will ask you to allow notifications — tap Allow to continue.
          </p>
        </div>

        <button
          type="button"
          className="absolute right-4 top-4 rounded-full p-1 text-primary-foreground/80 hover:bg-white/10 hover:text-primary-foreground"
          aria-label="Dismiss"
          onClick={close}
        >
          <X className="h-5 w-5" />
        </button>
      </DialogContent>
    </Dialog>
  );
}
