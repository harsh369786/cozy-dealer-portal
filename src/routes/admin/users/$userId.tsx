import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { AdminSection } from "@/components/admin/admin-section";
import { ConfirmActionDialog } from "@/components/shared/dialogs";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAsyncData } from "@/hooks/use-async-data";
import { getUser, deleteUser, updateUserStatus } from "@/services/admin/users";

export const Route = createFileRoute("/admin/users/$userId")({
  component: UserDetailPage,
});

function statusBadgeVariant(status: string) {
  if (status === "active") return "secondary";
  if (status === "pending_invite") return "default";
  return "destructive";
}

function statusLabel(status: string) {
  if (status === "pending_invite") return "Pending invite";
  return status;
}

function UserDetailPage() {
  const { userId } = Route.useParams();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const { data: user, loading, error, retry } = useAsyncData(() => getUser(userId), [userId]);

  const handleToggleStatus = async () => {
    if (!user) return;
    setActionLoading(true);
    try {
      const next = user.status === "active" ? "suspended" : "active";
      await updateUserStatus(user.id, next);
      toast.success(next === "active" ? "User activated" : "User suspended");
      retry();
      setConfirmOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!user) return;
    setActionLoading(true);
    try {
      await deleteUser(user.id);
      toast.success("User deleted");
      window.location.href = "/admin/users";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setActionLoading(false);
      setDeleteOpen(false);
    }
  };

  const handleResendInvite = async () => {
    toast.error("Invite resend is not available in the demo API");
  };

  if (loading) return <PageSkeleton rows={3} />;
  if (error || !user) return <ErrorState message={error ?? "User not found"} onRetry={retry} />;

  return (
    <div>
      <AdminPageHeader
        title={user.name}
        description={user.phone}
        actions={
          <Link to="/admin/users">
            <Button variant="outline" className="rounded-2xl font-bold">
              ← Back
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminSection title="Profile">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Role</dt>
              <dd className="font-bold capitalize">{user.role.replace("_", " ")}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <Badge variant={statusBadgeVariant(user.status)} className="capitalize">
                  {statusLabel(user.status)}
                </Badge>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Created</dt>
              <dd className="font-semibold">{user.createdAt}</dd>
            </div>
            {user.invitedAt && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Invite sent</dt>
                <dd className="font-semibold">{user.invitedAt}</dd>
              </div>
            )}
          </dl>
        </AdminSection>

        <AdminSection title="Assignments">
          {user.dealerName && (
            <p className="text-sm">
              <span className="text-muted-foreground">Dealer:</span>{" "}
              <span className="font-bold">{user.dealerName}</span>
            </p>
          )}
          {user.distributorName && (
            <p className="mt-2 text-sm">
              <span className="text-muted-foreground">Distributor:</span>{" "}
              <span className="font-bold">{user.distributorName}</span>
              {user.region && <span className="text-muted-foreground"> · {user.region}</span>}
            </p>
          )}
          {!user.dealerName && !user.distributorName && (
            <p className="text-sm text-muted-foreground">No linked entity.</p>
          )}
        </AdminSection>
      </div>

      {user.status === "pending_invite" && (
        <AdminSection title="WhatsApp invite" className="mt-4">
          <p className="text-sm text-muted-foreground">
            Invite sent via WhatsApp. Status becomes <strong>Active</strong> when the user completes signup with
            this phone number.
          </p>
          <AdminPermissionGate permission="users:write">
            <Button
              className="mt-3 rounded-2xl font-bold"
              variant="outline"
              onClick={handleResendInvite}
              disabled={actionLoading}
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              Resend WhatsApp invite
            </Button>
          </AdminPermissionGate>
        </AdminSection>
      )}

      <AdminPermissionGate permission="users:write">
        {user.status !== "pending_invite" && (
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              variant={user.status === "active" ? "destructive" : "default"}
              className="rounded-2xl font-bold"
              onClick={() => setConfirmOpen(true)}
            >
              {user.status === "active" ? "Suspend user" : "Activate user"}
            </Button>
            <Button
              variant="outline"
              className="rounded-2xl font-bold"
              onClick={() => setDeleteOpen(true)}
            >
              Delete user
            </Button>
          </div>
        )}
        <ConfirmActionDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={user.status === "active" ? "Suspend user?" : "Activate user?"}
          description={
            user.status === "active"
              ? "This user will no longer be able to sign in."
              : "This user will regain access to the portal."
          }
          confirmLabel={user.status === "active" ? "Suspend" : "Activate"}
          onConfirm={handleToggleStatus}
          loading={actionLoading}
          variant={user.status === "active" ? "destructive" : "default"}
        />
        <ConfirmActionDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="Delete user?"
          description="This soft-deletes the user and suspends their access."
          confirmLabel="Delete"
          onConfirm={handleDelete}
          loading={actionLoading}
          variant="destructive"
        />
      </AdminPermissionGate>
    </div>
  );
}
