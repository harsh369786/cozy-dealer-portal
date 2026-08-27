import { WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";

export function OfflineBanner() {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-amber-600 px-4 py-2 text-sm font-semibold text-white">
      <WifiOff className="h-4 w-4" />
      {t("offline.banner")}
    </div>
  );
}
