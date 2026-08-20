import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSection } from "@/components/admin/admin-section";
import { OrderTimeline } from "@/components/shared/order-timeline";
import { StatusBadge } from "@/components/shared/status-badge";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import type { ComplaintStatus } from "@/lib/mock/distributor/types";
import { getComplaint, updateComplaintStatus } from "@/services/admin/complaints";

export const Route = createFileRoute("/admin/complaints/$complaintId")({
  component: ComplaintDetailPage,
});

const STATUSES: ComplaintStatus[] = ["pending", "in_progress", "resolved", "rejected"];

function ComplaintDetailPage() {
  const { complaintId } = Route.useParams();
  const { isMasterAdmin } = useAdminPermissions();
  const [complaint, setComplaint] = useState<Awaited<ReturnType<typeof getComplaint>>>(null);
  const [status, setStatus] = useState<ComplaintStatus>("pending");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { loading, error, retry } = useAsyncData(async () => {
    const c = await getComplaint(complaintId);
    setComplaint(c);
    if (c) {
      setStatus(c.status);
      setNotes(c.resolutionNotes ?? "");
    }
    return c;
  }, [complaintId]);

  const handleUpdate = async () => {
    if (!isMasterAdmin) return;
    setSaving(true);
    try {
      await updateComplaintStatus(complaintId, status, notes || undefined);
      toast.success("Complaint updated");
      retry();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageSkeleton rows={3} />;
  if (error || !complaint) return <ErrorState message={error ?? "Complaint not found"} onRetry={retry} />;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={complaint.id}
        description={`${complaint.dealerName} · Order ${complaint.orderId}`}
        actions={
          <Link to="/admin/complaints">
            <Button variant="outline" className="rounded-2xl font-bold">← Back</Button>
          </Link>
        }
      />

      <div className="flex items-center justify-between">
        <StatusBadge kind="complaint" status={complaint.status} />
        <Link to="/admin/orders/$orderId" params={{ orderId: complaint.orderId }} className="text-sm font-bold text-primary">
          View order →
        </Link>
      </div>

      <AdminSection title="Details">
        <p className="text-sm font-semibold text-muted-foreground">{complaint.category}</p>
        <p className="mt-2 text-sm">{complaint.description}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          Distributor: {complaint.distributorName} · Created {complaint.createdAt}
        </p>
      </AdminSection>

      <AdminSection title="History">
        <OrderTimeline events={complaint.history.map((h) => ({ label: h.label, at: h.at, note: h.note }))} />
      </AdminSection>

      {isMasterAdmin && (
        <AdminSection title="Update status">
          <div className="grid max-w-lg gap-4">
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ComplaintStatus)}>
                <SelectTrigger className="mt-1 rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Resolution notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 rounded-2xl"
                placeholder="Optional notes for the dealer…"
              />
            </div>
            <Button className="rounded-2xl font-bold" onClick={handleUpdate} disabled={saving}>
              {saving ? "Saving…" : "Save update"}
            </Button>
          </div>
        </AdminSection>
      )}
    </div>
  );
}
