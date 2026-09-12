import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ApiError } from "@/lib/api-client";
import { assetPublicPath, STATIC_ASSET_KEYS } from "@/lib/asset-url";
import { Logo } from "@/components/brand";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { getPostLoginPath, getCurrentUser, peekCachedUser, requestOtp, verifyOtp } from "@/services/auth";
import { consumePendingNotificationTarget } from "@/lib/pending-notification-target";
import type { SessionUser } from "@/lib/mock/distributor/types";

// After login, prefer a deep-link the user was headed to (e.g. a tapped push notification while
// logged out) over the default landing page. Only applies to active users; pending/suspended keep
// their normal routing via getPostLoginPath.
function resolvePostLoginPath(user: SessionUser): string {
  if (user.status === "active") {
    const pending = consumePendingNotificationTarget();
    if (pending) return pending;
  }
  return getPostLoginPath(user);
}

const loginBg = assetPublicPath(STATIC_ASSET_KEYS.brand.loginBg);

export const Route = createFileRoute("/")({
  ssr: true,
  // `reason=suspended` is set by the suspension handler so the login page can show a banner.
  validateSearch: (search: Record<string, unknown>): { reason?: string } => ({
    reason: typeof search.reason === "string" ? search.reason : undefined,
  }),
  beforeLoad: async ({ search }) => {
    if (typeof window === "undefined") return;
    // If we arrived here because the account was suspended, stay on the login page and show the
    // banner — do NOT auto-redirect back into the app (that was the redirect loop).
    if (search.reason === "suspended") return;
    // A returning user (installed-PWA cold start reopens at start_url "/") must be bounced to their
    // home immediately from the cached/stored session — WITHOUT waiting on /auth/me, whose cookie
    // may not be attached yet on cold start. Waiting-and-getting-null is exactly what stranded the
    // user on this login page (a spurious "logout"). peekCachedUser() is synchronous (memory cache
    // or localStorage); getCurrentUser() revalidates in the background on the destination route.
    const cached = peekCachedUser();
    if (cached) {
      throw redirect({ to: getPostLoginPath(cached) });
    }
    const user = await getCurrentUser();
    if (user) {
      throw redirect({ to: getPostLoginPath(user) });
    }
  },
  head: () => ({
    meta: [
      { title: "BackRest Dealer App — Sleep. Reset. Perform." },
      {
        name: "description",
        content:
          "Dealer app for BackRest mattresses, pillows and cushions. Place orders, track them and earn reward points.",
      },
      { property: "og:title", content: "BackRest Dealer App" },
      {
        property: "og:description",
        content: "Order BackRest products, track deliveries and earn rewards — built for dealers.",
      },
    ],
  }),
  component: Login,
});

function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { reason } = Route.useSearch();
  const suspended = reason === "suspended";
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  async function handleRequestOtp() {
    setLoading(true);
    try {
      await requestOtp(phone);
      setStep("otp");
      setResendCooldown(30);
      toast.success(t("auth.otpSent"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("auth.couldNotSendOtp"));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    setLoading(true);
    try {
      const user = await verifyOtp(phone, otp);
      navigate({ to: resolvePostLoginPath(user) });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("auth.invalidOtp"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <img
        src={loginBg}
        alt=""
        width={900}
        height={1400}
        decoding="async"
        fetchPriority="low"
        className="pointer-events-none absolute inset-x-0 top-0 h-[46vh] w-full object-cover opacity-35"
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[46vh] bg-gradient-to-b from-transparent to-background" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[430px] flex-col px-6 pb-10 pt-6 md:max-w-[520px]">
        <div className="flex justify-end">
          <LanguageSwitcher compact />
        </div>
        <div className="mt-4 animate-rise">
          <Logo size="lg" />
          <p className="mt-6 font-display text-3xl font-bold leading-tight">
            {t("auth.welcomeTo")}
            <br />
            <span className="text-brand-gradient">{t("auth.dealerApp")}</span>
          </p>
          <p className="mt-3 text-base text-muted-foreground">{t("auth.welcomeBack")}</p>
        </div>

        {suspended && (
          <div
            role="alert"
            className="mt-4 animate-rise rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm font-semibold text-destructive"
          >
            {t("auth.suspendedBanner")}
          </div>
        )}

        <div className="mt-auto animate-rise rounded-3xl border border-border bg-card p-5 shadow-lift">
          {step === "phone" ? (
            <>
              <label htmlFor="phone" className="text-sm font-semibold">
                {t("auth.mobileNumber")}
              </label>
              <input
                id="phone"
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                placeholder={t("common.phonePlaceholder")}
                className="mt-2 h-14 w-full rounded-2xl border border-input bg-background px-4 text-lg font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground"
              />
              <button
                onClick={handleRequestOtp}
                disabled={phone.length !== 10 || loading}
                className="press mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl brand-gradient text-lg font-bold text-primary-foreground disabled:opacity-45"
              >
                {loading ? t("common.sending") : t("auth.continueWithMobile")}{" "}
                <ArrowRight className="h-5 w-5" />
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">{t("auth.enterOtpSent", { phone })}</p>
              <input
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder={t("common.otpPlaceholder")}
                className="mt-3 h-16 w-full rounded-2xl border border-input bg-background text-center font-display text-3xl font-bold tracking-[0.4em] outline-none focus:border-ring"
              />
              <button
                onClick={handleVerifyOtp}
                disabled={otp.length !== 6 || loading}
                className="press mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl brand-gradient text-lg font-bold text-primary-foreground disabled:opacity-45"
              >
                {loading ? t("common.verifying") : t("auth.verifyAndContinue")}{" "}
                <ArrowRight className="h-5 w-5" />
              </button>
              <button
                onClick={handleRequestOtp}
                disabled={loading || resendCooldown > 0}
                className="mt-3 w-full text-sm font-semibold text-primary disabled:opacity-45"
              >
                {loading
                  ? t("auth.resendingOtp")
                  : resendCooldown > 0
                    ? `${t("auth.resendOtp")} (${resendCooldown}s)`
                    : t("auth.resendOtp")}
              </button>
              <button
                onClick={() => setStep("phone")}
                className="mt-3 w-full text-sm font-semibold text-muted-foreground"
              >
                {t("auth.changeNumber")}
              </button>
            </>
          )}

          <p className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4" /> {t("auth.safeLogin")}
          </p>
        </div>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          {t("auth.newDealer")}{" "}
          <Link
            to="/signup"
            className="font-bold text-foreground underline underline-offset-4"
          >
            {t("auth.signUp")}
          </Link>
        </p>
      </div>
    </div>
  );
}
