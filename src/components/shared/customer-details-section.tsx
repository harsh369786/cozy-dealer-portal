import { MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/**
 * The customer details a dealer optionally enters when placing an order. Stored per Order ID and
 * shown, read-only, in EVERY order-detail view (dealer, distributor, admin, sales exec, admin
 * staff) so every authorized user sees the same information for the life of the order.
 */
export type OrderCustomerDetails = {
  customerName?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  customerEmail?: string | null;
};

/**
 * Dedicated "Customer Details" section. Renders only the fields that were actually provided; when
 * none were provided it shows a clear "not provided" note (so the section is never blank or
 * fabricated). Self-contained (own heading + card) so it drops into any order view consistently.
 */
export function CustomerDetailsSection({
  order,
  className,
}: {
  order: OrderCustomerDetails;
  className?: string;
}) {
  const { t } = useTranslation();

  const name = order.customerName?.trim() || "";
  const phone = order.customerPhone?.trim() || "";
  const address = order.customerAddress?.trim() || "";
  const email = order.customerEmail?.trim() || "";
  const hasAny = Boolean(name || phone || address || email);

  return (
    <div className={cn("rounded-2xl border border-border bg-card p-4 text-sm", className)}>
      <p className="font-display font-bold">{t("common.customerDetails")}</p>

      {!hasAny ? (
        <p className="mt-2 text-muted-foreground">{t("common.customerDetailsNotProvided")}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {name && (
            <Field label={t("common.customer")}>
              <span className="font-bold">{name}</span>
            </Field>
          )}
          {phone && (
            <Field label={t("common.customerPhone")}>
              <a
                href={`tel:${phone.replace(/\s/g, "")}`}
                className="font-semibold text-primary hover:underline"
              >
                {phone}
              </a>
            </Field>
          )}
          {email && (
            <Field label={t("common.customerEmail")}>
              <a href={`mailto:${email}`} className="font-semibold text-primary hover:underline">
                {email}
              </a>
            </Field>
          )}
          {address && (
            <Field label={t("common.customerAddress")}>
              <span className="flex items-start gap-1.5 font-semibold">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{address}</span>
              </span>
            </Field>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
