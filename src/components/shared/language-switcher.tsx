import { cn } from "@/lib/utils";
import { setLocale, type Locale } from "@/lib/i18n";
import { useTranslation } from "react-i18next";

type LanguageSwitcherProps = {
  className?: string;
  compact?: boolean;
};

export function LanguageSwitcher({ className, compact = false }: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation();
  const current = i18n.language === "hi" ? "hi" : "en";

  const select = (locale: Locale) => {
    if (locale !== current) void setLocale(locale);
  };

  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border border-border bg-card p-0.5 text-xs font-bold",
        className,
      )}
      role="group"
      aria-label={t("common.language")}
    >
      <button
        type="button"
        onClick={() => select("en")}
        className={cn(
          "rounded-full px-2.5 py-1 transition-colors",
          compact && "px-2 py-0.5",
          current === "en" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
        )}
        aria-pressed={current === "en"}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => select("hi")}
        className={cn(
          "rounded-full px-2.5 py-1 transition-colors",
          compact && "px-2 py-0.5",
          current === "hi" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
        )}
        aria-pressed={current === "hi"}
      >
        हिं
      </button>
    </div>
  );
}
