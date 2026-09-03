import { useTranslation } from "react-i18next";
import { History } from "lucide-react";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { formatTimestamp } from "@/lib/date-format";

export type LastEditedByInfo = {
  name: string;
  role: string;
  at: string;
  action?: string;
} | null | undefined;

const ROLE_LABELS: Record<string, string> = {
  master_admin: "Master Admin",
  admin_staff: "Admin Staff",
  distributor: "Distributor",
  sales_executive: "Sales Executive",
  dealer: "Dealer",
  system: "System",
};

/**
 * Shows who last edited a record (name, role, timestamp) from audit data.
 * Only rendered for Master Admin; hidden when there is no audit history.
 */
export function LastEditedBy({ info }: { info: LastEditedByInfo }) {
  const { t } = useTranslation();
  const { isMasterAdmin } = useAdminPermissions();

  if (!isMasterAdmin || !info) return null;

  const roleLabel = ROLE_LABELS[info.role] ?? info.role;
  const when = info.at ? formatTimestamp(info.at) : "";

  return (
    <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
      <History className="h-3.5 w-3.5 shrink-0" />
      <span>
        {t("admin.lastEditedBy", {
          name: info.name,
          role: roleLabel,
          when,
          defaultValue: "Last edited by {{name}} ({{role}}) on {{when}}",
        })}
      </span>
    </div>
  );
}
