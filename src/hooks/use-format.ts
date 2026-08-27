import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getIntlLocale } from "@/lib/i18n";
import { IST_TIMEZONE } from "@/lib/date-format";

export function useFormat() {
  const { i18n } = useTranslation();
  const intlLocale = getIntlLocale(i18n.language);

  const formatCurrency = useCallback(
    (amount: number) =>
      new Intl.NumberFormat(intlLocale, {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }).format(amount),
    [intlLocale],
  );

  const formatNumber = useCallback(
    (value: number) => new Intl.NumberFormat(intlLocale).format(value),
    [intlLocale],
  );

  const formatDisplayDate = useCallback(
    (iso: string) => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) {
        const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return `${m[3]}/${m[2]}/${m[1]}`;
        return iso;
      }
      return new Intl.DateTimeFormat(intlLocale, {
        timeZone: IST_TIMEZONE,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(d);
    },
    [intlLocale],
  );

  const formatTimestamp = useCallback(
    (iso: string) => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return new Intl.DateTimeFormat(intlLocale, {
        timeZone: IST_TIMEZONE,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(d);
    },
    [intlLocale],
  );

  const formatYearMonth = useCallback(
    (ym: string) => {
      if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return "—";
      const [year, month] = ym.split("-").map(Number);
      const d = new Date(Date.UTC(year, month - 1, 1));
      if (Number.isNaN(d.getTime())) return ym;
      return new Intl.DateTimeFormat(intlLocale, {
        timeZone: IST_TIMEZONE,
        month: "short",
        year: "numeric",
      }).format(d);
    },
    [intlLocale],
  );

  return {
    locale: i18n.language === "hi" ? ("hi" as const) : ("en" as const),
    intlLocale,
    formatCurrency,
    formatNumber,
    formatDisplayDate,
    formatTimestamp,
    formatYearMonth,
  };
}
