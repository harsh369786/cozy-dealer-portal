import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { AdminSection } from "@/components/admin/admin-section";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { useFormat } from "@/hooks/use-format";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { getWhatsappOutbox, sendWhatsappTest } from "@/services/admin/whatsapp";

export const Route = createFileRoute("/admin/whatsapp/")({
  component: WhatsappPage,
});

const TEMPLATE_LABELS: Record<string, string> = {
  otp_for_login: "Login OTP",
  mattress_order_placed: "Order Placed",
  mattress_order_rejection: "Order Rejected",
  mattress_delivered: "Order Delivered",
  campaign_live: "Campaign Live",
};

function WhatsappPage() {
  return (
    <AdminPermissionGate permission="settings:read">
      <WhatsappContent />
    </AdminPermissionGate>
  );
}

function WhatsappContent() {
  const { formatTimestamp } = useFormat();
  const { can } = useAdminPermissions();
  const canTest = can("settings:write");
  const [testing, setTesting] = useState<string | null>(null);

  const { data, loading, error, retry } = useAsyncData(() => getWhatsappOutbox({ limit: 100 }), []);

  const runTest = async (templateKey: string) => {
    setTesting(templateKey);
    try {
      const res = await sendWhatsappTest({ templateKey });
      if (res.ok) toast.success(`Test sent: ${TEMPLATE_LABELS[templateKey] ?? templateKey}`);
      else toast.error(res.error ?? "Test failed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTesting(null);
      retry();
    }
  };

  if (loading) return <PageSkeleton rows={4} />;
  if (error || !data) return <ErrorState message={error ?? "Failed to load WhatsApp log"} onRetry={retry} />;

  const statusColor = (s: string) =>
    s === "sent" ? "bg-success/15 text-success" : s === "failed" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground";

  return (
    <div className="min-w-0 space-y-4">
      <AdminPageHeader
        title="WhatsApp"
        description="Gupshup WhatsApp integration status and recent message log."
      />

      <AdminSection title="Integration status">
        <div className="flex flex-wrap items-center gap-3">
          <Badge className={data.configured ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}>
            {data.configured ? "Configured" : "Not configured"}
          </Badge>
          <span className="text-sm text-muted-foreground">
            Templates: {data.templates.map((t) => TEMPLATE_LABELS[t] ?? t).join(", ")}
          </span>
        </div>
        {canTest && (
          <div className="mt-3 flex flex-wrap gap-2">
            {data.templates.map((t) => (
              <Button
                key={t}
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl"
                disabled={!data.configured || Boolean(testing)}
                onClick={() => void runTest(t)}
              >
                {testing === t ? "Sending…" : `Test: ${TEMPLATE_LABELS[t] ?? t}`}
              </Button>
            ))}
          </div>
        )}
        {!data.configured && (
          <p className="mt-2 text-xs text-muted-foreground">
            Configure the Gupshup API key, source number and template IDs on the server to enable sending.
          </p>
        )}
      </AdminSection>

      <AdminDataTable
        data={data.messages}
        keyFn={(m) => m.id}
        emptyTitle="No WhatsApp messages yet"
        columns={[
          { key: "time", header: "Time", cell: (m) => formatTimestamp(m.scheduledAt), hideOnMobile: true },
          { key: "event", header: "Event", cell: (m) => TEMPLATE_LABELS[m.templateKey] ?? m.businessEvent ?? m.templateKey },
          { key: "to", header: "To", cell: (m) => m.toPhone, hideOnMobile: true },
          { key: "ref", header: "Reference", cell: (m) => m.referenceId ?? "—", hideOnMobile: true },
          {
            key: "status",
            header: "Status",
            cell: (m) => (
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor(m.status)}`}>
                {m.status}
              </span>
            ),
          },
          { key: "error", header: "Error", cell: (m) => <span className="break-words text-xs text-destructive">{m.error ?? ""}</span> },
        ]}
      />
    </div>
  );
}
