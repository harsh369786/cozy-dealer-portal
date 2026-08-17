import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import loginBg from "@/assets/login-bg.jpg";
import { Logo, ThemeSwitcher } from "@/components/brand";

export const Route = createFileRoute("/")({
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
  const navigate = useNavigate();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <img
        src={loginBg}
        alt=""
        width={900}
        height={1400}
        className="pointer-events-none absolute inset-x-0 top-0 h-[46vh] w-full object-cover opacity-35"
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[46vh] bg-gradient-to-b from-transparent to-background" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[430px] flex-col px-6 pb-10 pt-6 md:max-w-[520px]">
        <div className="flex justify-end">
          <ThemeSwitcher />
        </div>

        <div className="mt-10 animate-rise">
          <Logo size="lg" />
          <p className="mt-6 font-display text-3xl font-bold leading-tight">
            Welcome to your
            <br />
            <span className="text-brand-gradient">Dealer App</span>
          </p>
          <p className="mt-3 text-base text-muted-foreground">
            Welcome back. Order BackRest products, track them and earn rewards — all in one place.
          </p>
        </div>

        <div className="mt-auto animate-rise rounded-3xl border border-border bg-card p-5 shadow-lift">
          {step === "phone" ? (
            <>
              <label htmlFor="phone" className="text-sm font-semibold">
                Your mobile number
              </label>
              <div className="mt-2 flex items-center gap-2 rounded-2xl border border-input bg-background px-4">
                <span className="text-base font-semibold text-muted-foreground">+91</span>
                <input
                  id="phone"
                  inputMode="numeric"
                  maxLength={10}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                  placeholder="98765 43210"
                  className="h-14 w-full bg-transparent text-lg font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground"
                />
              </div>
              <button
                onClick={() => setStep("otp")}
                disabled={phone.length !== 10}
                className="press mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl brand-gradient text-lg font-bold text-primary-foreground disabled:opacity-45"
              >
                Continue with Mobile Number <ArrowRight className="h-5 w-5" />
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">
                Enter the 4-digit code sent to +91 {phone}
              </p>
              <input
                inputMode="numeric"
                maxLength={4}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="0000"
                className="mt-3 h-16 w-full rounded-2xl border border-input bg-background text-center font-display text-3xl font-bold tracking-[0.6em] outline-none focus:border-ring"
              />
              <button
                onClick={() => navigate({ to: "/home" })}
                disabled={otp.length !== 4}
                className="press mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl brand-gradient text-lg font-bold text-primary-foreground disabled:opacity-45"
              >
                Verify & Continue <ArrowRight className="h-5 w-5" />
              </button>
              <button
                onClick={() => setStep("phone")}
                className="mt-3 w-full text-sm font-semibold text-muted-foreground"
              >
                Change number
              </button>
            </>
          )}

          <p className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4" /> Safe login. No password needed.
          </p>
        </div>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          New dealer?{" "}
          <button className="font-bold text-foreground underline underline-offset-4">Sign Up</button>
        </p>
      </div>
    </div>
  );
}
