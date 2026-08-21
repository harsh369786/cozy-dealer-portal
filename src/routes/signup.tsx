import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { ArrowRight, Check, ChevronLeft, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { assetPublicPath, STATIC_ASSET_KEYS } from "@/lib/asset-url";
import { Logo } from "@/components/brand";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitSignupApplication } from "@/services/signup";
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

const signupSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name"),
  birthday: z
    .string()
    .min(1, "Select your birthday")
    .refine((value) => {
      const date = new Date(value);
      return !Number.isNaN(date.getTime()) && date < new Date();
    }, "Enter a valid date of birth"),
  storeName: z.string().trim().min(2, "Enter your store name"),
  phone: z.string().regex(/^\d{10}$/, "Enter a valid 10-digit mobile number"),
  address: z.string().trim().min(10, "Enter your full store address"),
  gstNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
      "Enter a valid 15-character GST number",
    ),
  distributorName: z.string().trim().min(2, "Enter your distributor name"),
});

type SignupFields = z.infer<typeof signupSchema>;

const fieldClass =
  "h-12 rounded-2xl border-input bg-background px-4 text-base font-medium shadow-none";

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-sm font-semibold">
        {label} <span className="text-destructive">*</span>
      </Label>
      <div className="mt-2">{children}</div>
      {error && <p className="mt-1.5 text-sm text-destructive">{error}</p>}
    </div>
  );
}

function SignUpPage() {
  const [form, setForm] = useState<SignupFields>({
    name: "",
    birthday: "",
    storeName: "",
    phone: "",
    address: "",
    gstNumber: "",
    distributorName: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof SignupFields, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const update = (key: keyof SignupFields, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

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
      await submitSignupApplication(result.data);
      setSubmitted(true);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not submit application. Please try again.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-background">
        <div className="relative mx-auto flex min-h-screen w-full max-w-[430px] flex-col px-6 pb-10 pt-6 md:max-w-[520px]">
          <div className="mt-16 animate-rise text-center">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full brand-gradient">
              <Check className="h-10 w-10 text-primary-foreground" strokeWidth={3} />
            </div>
            <h1 className="mt-6 font-display text-2xl font-bold">Application Submitted</h1>
            <p className="mt-3 text-base text-muted-foreground">
              Thanks, {form.name.split(" ")[0]}! We&apos;ve received your dealer sign-up for{" "}
              <span className="font-semibold text-foreground">{form.storeName}</span>. You can sign in with
              your phone number now — you&apos;ll see a confirmation screen while an administrator reviews
              your request.
            </p>
            <Link
              to="/"
              className="press mt-8 flex h-14 w-full items-center justify-center gap-2 rounded-2xl brand-gradient text-lg font-bold text-primary-foreground"
            >
              Back to Login <ArrowRight className="h-5 w-5" />
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
        <Link
          to="/"
          className="press inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
          Back to login
        </Link>

        <div className="mt-6 animate-rise">
          <Logo size="sm" />
          <h1 className="mt-4 font-display text-3xl font-bold leading-tight">
            Dealer <span className="text-brand-gradient">Sign Up</span>
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Fill in your store details. All fields are required.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-6 animate-rise space-y-4 rounded-3xl border border-border bg-card p-5 shadow-lift"
        >
          <Field id="name" label="Name" error={errors.name}>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Rajesh Sharma"
              className={fieldClass}
              autoComplete="name"
            />
          </Field>

          <Field id="birthday" label="Birthday" error={errors.birthday}>
            <Input
              id="birthday"
              type="date"
              value={form.birthday}
              onChange={(e) => update("birthday", e.target.value)}
              className={cn(fieldClass, "block")}
              max={new Date().toISOString().split("T")[0]}
            />
          </Field>

          <Field id="storeName" label="Store name" error={errors.storeName}>
            <Input
              id="storeName"
              value={form.storeName}
              onChange={(e) => update("storeName", e.target.value)}
              placeholder="Sharma Furnishings"
              className={fieldClass}
            />
          </Field>

          <Field id="phone" label="Number" error={errors.phone}>
            <div className="flex items-center gap-2 rounded-2xl border border-input bg-background px-4">
              <span className="text-base font-semibold text-muted-foreground">+91</span>
              <input
                id="phone"
                inputMode="numeric"
                maxLength={10}
                value={form.phone}
                onChange={(e) => update("phone", e.target.value.replace(/\D/g, ""))}
                placeholder="98765 43210"
                className="h-12 w-full bg-transparent text-base font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground"
              />
            </div>
          </Field>

          <Field id="address" label="Address" error={errors.address}>
            <Textarea
              id="address"
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              placeholder="Shop address with city and pincode"
              className="min-h-24 rounded-2xl border-input bg-background px-4 py-3 text-base font-medium shadow-none"
            />
          </Field>

          <Field id="gstNumber" label="GST number" error={errors.gstNumber}>
            <Input
              id="gstNumber"
              value={form.gstNumber}
              onChange={(e) => update("gstNumber", e.target.value.toUpperCase())}
              placeholder="27AABCU9603R1ZM"
              maxLength={15}
              className={cn(fieldClass, "uppercase tracking-wide")}
            />
          </Field>

          <Field id="distributorName" label="Distributor name" error={errors.distributorName}>
            <Input
              id="distributorName"
              value={form.distributorName}
              onChange={(e) => update("distributorName", e.target.value)}
              placeholder="Vikram Mehta"
              className={fieldClass}
            />
          </Field>

          <button
            type="submit"
            disabled={submitting}
            className="press flex h-14 w-full items-center justify-center gap-2 rounded-2xl brand-gradient text-lg font-bold text-primary-foreground disabled:opacity-45"
          >
            {submitting ? "Submitting..." : "Submit Application"}
            {!submitting && <ArrowRight className="h-5 w-5" />}
          </button>

          <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4" /> Your details are sent for admin review.
          </p>
        </form>
      </div>
    </div>
  );
}
