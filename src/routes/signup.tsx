import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, Check, ChevronLeft, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { assetPublicPath, STATIC_ASSET_KEYS } from "@/lib/asset-url";
import { Logo } from "@/components/brand";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { lookupPincode, submitSignupApplication } from "@/services/signup";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";

const loginBg = assetPublicPath(STATIC_ASSET_KEYS.brand.loginBg);

export const Route = createFileRoute("/signup")({
  ssr: true,
  head: () => ({
    meta: [
      { title: "Dealer Sign Up — BackRest" },
      {
        name: "description",
        content: "Register as a BackRest dealer. Submit your store details to get started.",
      },
    ],
  }),
  component: SignUpPage,
});

type SignupFields = {
  name: string;
  birthday: string;
  storeName: string;
  phone: string;
  pincode: string;
  area: string;
  address: string;
  gstNumber: string;
};

const fieldClass =
  "h-12 rounded-2xl border-input bg-background px-4 text-base font-medium shadow-none";

function Field({
  id,
  label,
  error,
  required = true,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-sm font-semibold">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <div className="mt-2">{children}</div>
      {error && <p className="mt-1.5 text-sm text-destructive">{error}</p>}
    </div>
  );
}

function SignUpPage() {
  const { t } = useTranslation();
  const signupSchema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(2, t("validation.enterFullName")),
        birthday: z
          .string()
          .min(1, t("validation.selectBirthday"))
          .refine((value) => {
            const date = new Date(value);
            return !Number.isNaN(date.getTime()) && date < new Date();
          }, t("validation.validDateOfBirth")),
        storeName: z
          .string()
          .trim()
          .optional()
          .refine((v) => !v || v.length >= 2, t("validation.storeNameMin2")),
        phone: z.string().regex(/^\d{10}$/, t("validation.validMobile10")),
        pincode: z.string().regex(/^\d{6}$/, t("validation.validPincode")),
        area: z.string().trim().min(1, t("validation.selectArea")),
        address: z.string().trim().min(10, t("validation.fullStoreAddress")),
        gstNumber: z
          .string()
          .trim()
          .toUpperCase()
          .optional()
          .refine(
            (v) => !v || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v),
            t("validation.validGst15"),
          ),
      }),
    [t],
  );

  const [form, setForm] = useState<SignupFields>({
    name: "",
    birthday: "",
    storeName: "",
    phone: "",
    pincode: "",
    area: "",
    address: "",
    gstNumber: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof SignupFields, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Resolved location for the entered pincode (State/District auto-filled, Area chosen).
  const [pinState, setPinState] = useState("");
  const [pinDistrict, setPinDistrict] = useState("");
  const [pinAreas, setPinAreas] = useState<string[]>([]);
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const update = (key: keyof SignupFields, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  // Resolve State/District/Area from the master whenever a full 6-digit pincode is entered.
  useEffect(() => {
    const code = form.pincode;
    if (!/^\d{6}$/.test(code)) {
      setPinState("");
      setPinDistrict("");
      setPinAreas([]);
      setPinError(null);
      return;
    }
    let cancelled = false;
    setPinLoading(true);
    setPinError(null);
    lookupPincode(code)
      .then((res) => {
        if (cancelled) return;
        if (!res) {
          setPinState("");
          setPinDistrict("");
          setPinAreas([]);
          setPinError(t("validation.pincodeNotFound"));
          setForm((prev) => ({ ...prev, area: "" }));
          return;
        }
        setPinState(res.state);
        setPinDistrict(res.district);
        setPinAreas(res.areas);
        // Auto-select the only area; otherwise clear so the user must choose.
        setForm((prev) => ({ ...prev, area: res.areas.length === 1 ? res.areas[0]! : "" }));
      })
      .catch(() => {
        if (!cancelled) setPinError(t("validation.pincodeNotFound"));
      })
      .finally(() => {
        if (!cancelled) setPinLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [form.pincode, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = signupSchema.safeParse(form);
    if (!result.success) {
      const next: Partial<Record<keyof SignupFields, string>> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof SignupFields;
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }

    setSubmitting(true);
    try {
      await submitSignupApplication({
        ...result.data,
        storeName: result.data.storeName?.trim() || undefined,
        gstNumber: result.data.gstNumber?.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("auth.couldNotSubmitApplication");
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-background">
        <div className="relative mx-auto flex min-h-screen w-full max-w-[430px] flex-col px-6 pb-10 pt-6 md:max-w-[520px]">
          <div className="flex justify-end">
            <LanguageSwitcher compact />
          </div>
          <div className="mt-10 animate-rise text-center">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full brand-gradient">
              <Check className="h-10 w-10 text-primary-foreground" strokeWidth={3} />
            </div>
            <h1 className="mt-6 font-display text-2xl font-bold">{t("auth.applicationSubmitted")}</h1>
            <p className="mt-3 text-base text-muted-foreground">
              {t("auth.applicationSubmittedBody", {
                name: form.name.split(" ")[0],
                storePart: form.storeName?.trim()
                  ? t("auth.applicationSubmittedStoreFor", { storeName: form.storeName })
                  : "",
              })}
            </p>
            <Link
              to="/"
              className="press mt-8 flex h-14 w-full items-center justify-center gap-2 rounded-2xl brand-gradient text-lg font-bold text-primary-foreground"
            >
              {t("auth.backToLoginButton")} <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <img
        src={loginBg}
        alt=""
        width={900}
        height={1400}
        className="pointer-events-none absolute inset-x-0 top-0 h-[32vh] w-full object-cover opacity-30"
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[32vh] bg-gradient-to-b from-transparent to-background" />

      <div className="relative mx-auto w-full max-w-[430px] px-6 pb-10 pt-6 md:max-w-[520px]">
        <div className="flex items-center justify-between gap-3">
          <Link
            to="/"
            className="press inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground"
          >
            <ChevronLeft className="h-5 w-5" />
            {t("common.backToLogin")}
          </Link>
          <LanguageSwitcher compact />
        </div>

        <div className="mt-6 animate-rise">
          <Logo size="sm" />
          <h1 className="mt-4 font-display text-3xl font-bold leading-tight">
            {t("auth.dealerSignUp")}
          </h1>
          <p className="mt-2 text-base text-muted-foreground">{t("auth.signupInstructions")}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-6 animate-rise space-y-4 rounded-3xl border border-border bg-card p-5 shadow-lift"
        >
          <Field id="name" label={t("common.contactName")} error={errors.name}>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              className={fieldClass}
              autoComplete="name"
            />
          </Field>

          <Field id="birthday" label={t("common.birthday")} error={errors.birthday}>
            <Input
              id="birthday"
              type="date"
              value={form.birthday}
              onChange={(e) => update("birthday", e.target.value)}
              className={cn(fieldClass, "block")}
              max={new Date().toISOString().split("T")[0]}
            />
          </Field>

          <Field id="storeName" label={t("common.storeName")} error={errors.storeName} required={false}>
            <Input
              id="storeName"
              value={form.storeName}
              onChange={(e) => update("storeName", e.target.value)}
              className={fieldClass}
            />
          </Field>

          <Field id="phone" label={t("common.mobileNumber")} error={errors.phone}>
            <div className="flex items-center gap-2 rounded-2xl border border-input bg-background px-4">
              <span className="text-base font-semibold text-muted-foreground">{t("common.countryCode")}</span>
              <input
                id="phone"
                inputMode="numeric"
                maxLength={10}
                value={form.phone}
                onChange={(e) => update("phone", e.target.value.replace(/\D/g, ""))}
                className="h-12 w-full bg-transparent text-base font-semibold outline-none"
              />
            </div>
          </Field>

          <Field id="pincode" label={t("common.pincode")} error={errors.pincode ?? pinError ?? undefined}>
            <Input
              id="pincode"
              inputMode="numeric"
              maxLength={6}
              value={form.pincode}
              onChange={(e) => update("pincode", e.target.value.replace(/\D/g, ""))}
              className={fieldClass}
              autoComplete="postal-code"
            />
            {pinLoading ? (
              <p className="mt-1.5 text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : null}
          </Field>

          {pinState || pinDistrict ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-semibold">{t("common.state")}</Label>
                <Input value={pinState} readOnly disabled className={cn(fieldClass, "mt-2")} />
              </div>
              <div>
                <Label className="text-sm font-semibold">{t("common.district")}</Label>
                <Input value={pinDistrict} readOnly disabled className={cn(fieldClass, "mt-2")} />
              </div>
            </div>
          ) : null}

          {pinAreas.length > 0 ? (
            <Field id="area" label={t("common.area")} error={errors.area}>
              {pinAreas.length === 1 ? (
                <Input value={form.area} readOnly disabled className={fieldClass} />
              ) : (
                <Select value={form.area} onValueChange={(v) => update("area", v)}>
                  <SelectTrigger id="area" className={fieldClass}>
                    <SelectValue placeholder={t("common.selectArea")} />
                  </SelectTrigger>
                  <SelectContent>
                    {pinAreas.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          ) : null}

          <Field id="address" label={t("common.address")} error={errors.address}>
            <Textarea
              id="address"
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              className="min-h-24 rounded-2xl border-input bg-background px-4 py-3 text-base font-medium shadow-none"
            />
          </Field>

          <Field id="gstNumber" label={t("common.gstNumber")} error={errors.gstNumber} required={false}>
            <Input
              id="gstNumber"
              value={form.gstNumber}
              onChange={(e) => update("gstNumber", e.target.value.toUpperCase())}
              maxLength={15}
              className={cn(fieldClass, "uppercase tracking-wide")}
            />
          </Field>

          <button
            type="submit"
            disabled={submitting}
            className="press flex h-14 w-full items-center justify-center gap-2 rounded-2xl brand-gradient text-lg font-bold text-primary-foreground disabled:opacity-45"
          >
            {submitting ? t("common.submitting") : t("auth.submitApplication")}
            {!submitting && <ArrowRight className="h-5 w-5" />}
          </button>

          <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4" /> {t("auth.detailsForReview")}
          </p>
        </form>
      </div>
    </div>
  );
}
