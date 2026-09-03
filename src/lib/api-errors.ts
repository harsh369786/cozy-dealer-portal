import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "@/lib/api-client";
import i18n from "@/lib/i18n";

export function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

function formatApiErrorWithT(
  error: unknown,
  t: (key: string) => string,
  fallbackKey = "errors.somethingWentWrong",
): string {
  if (error instanceof ApiError) {
    if (error.code) {
      const key = `errors.${error.code}`;
      const translated = t(key);
      if (translated !== key) return translated;
    }
    const body = error.message;
    const codeMatch = body.match(/^\[([^\]]+)\]/);
    if (codeMatch) {
      const code = codeMatch[1];
      const key = `errors.${code}`;
      const translated = t(key);
      if (translated !== key) return translated;
    }
    if (error.status === 403) return t("errors.forbidden");
    if (error.status === 404) return t("errors.notFound");
    if (error.status === 401) return t("auth.sessionExpired");
    return body || t(fallbackKey);
  }
  if (error instanceof Error && error.message) return error.message;
  return t(fallbackKey);
}

/** Non-hook formatter for service layers and effects outside React. */
export function formatApiError(error: unknown, fallbackKey = "errors.somethingWentWrong"): string {
  return formatApiErrorWithT(error, i18n.t.bind(i18n), fallbackKey);
}

export function useFormatApiError() {
  const { t } = useTranslation();

  return useCallback(
    (error: unknown, fallbackKey = "errors.somethingWentWrong"): string =>
      formatApiErrorWithT(error, t, fallbackKey),
    [t],
  );
}

export function formatApiErrorStatic(
  error: unknown,
  t: (key: string) => string,
  fallbackKey = "errors.somethingWentWrong",
): string {
  return formatApiErrorWithT(error, t, fallbackKey);
}
