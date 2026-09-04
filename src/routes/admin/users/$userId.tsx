import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { AdminSection } from "@/components/admin/admin-section";
import { ConfirmActionDialog } from "@/components/shared/dialogs";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import type { UserRole } from "@/lib/mock/distributor/types";
import { listPricingTiers } from "@/services/admin/pricing-tiers";
import { getUser, deleteUser, getUserCreateOptions, resendUserInvite, updateUser, updateUserStatus } from "@/services/admin/users";

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
  const { t } = useTranslation();
  const { userId } = Route.useParams();
  const { can, user: actor } = useAdminPermissions();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [roleConfirmOpen, setRoleConfirmOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [editRole, setEditRole] = useState<UserRole>("dealer");
  const [editDealerId, setEditDealerId] = useState("");
  const [editDistributorId, setEditDistributorId] = useState("");
  const [editTierId, setEditTierId] = useState("");

  const optionsQuery = useAsyncData(() => getUserCreateOptions(), []);
  const tiersQuery = useAsyncData(() => listPricingTiers(), []);

  const { data: user, loading, error, retry } = useAsyncData(() => getUser(userId), [userId]);

  useEffect(() => {
    if (!user) return;
    setEditRole(user.role);
    setEditDealerId(user.dealerId ?? "");
    setEditDistributorId(user.distributorId ?? "");
    setEditTierId(user.pricingTierId ?? "tier-t1");
  }, [user?.id, user?.role, user?.dealerId, user?.distributorId, user?.pricingTierId]);

  const roleOptions: UserRole[] =
    actor?.role === "master_admin"
      ? ["dealer", "distributor", "sales_executive", "sales_head", "admin_staff", "master_admin"]
      : ["dealer", "distributor", "sales_executive"];

  const roleDirty =
    user &&
    (editRole !== user.role ||
      (editRole === "dealer" && editDealerId !== (user.dealerId ?? "")) ||
      (editRole === "distributor" && editDistributorId !== (user.distributorId ?? "")) ||
      ((editRole === "dealer" || editRole === "distributor") &&
        editTierId !== (user.pricingTierId ?? "tier-t1")));

  const handleSaveRole = async () => {
    if (!user) return;
    if (editRole === "dealer" && !editDealerId) {
      toast.error("Select a dealer for dealer role");
      return;
    }
    if (editRole === "distributor" && !editDistributorId) {
      toast.error("Select a distributor for distributor role");
      return;
    }
    setActionLoading(true);
    try {
      await updateUser(user.id, {
        role: editRole,
        dealerId: editRole === "dealer" ? editDealerId : null,
        distributorId: editRole === "distributor" ? editDistributorId : null,
        pricingTierId: editRole === "dealer" || editRole === "distributor" ? editTierId : null,
      });
      toast.success("User role updated");
      setRoleConfirmOpen(false);
      retry();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setActionLoading(false);
    }
  };

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
      toast.error(e instanceof Error ? e.message : t("errors.saveFailed"));
    } finally {
      setActionLoading(false);
      setDeleteOpen(false);
    }
  };

  const handleResendInvite = async () => {
    if (!user) return;
    setActionLoading(true);
    try {
      const result = await resendUserInvite(user.id);
      toast.success("WhatsApp invite queued", {
        description: `Invite resent to ${user.phone}.`,
      });
      if (result.invitedAt) retry();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to resend invite");
    } finally {
      setActionLoading(false);
    }
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

        <AdminPermissionGate permission="users:write">
          <AdminSection title="Role & access" className="mt-4">
            <div className="grid max-w-md gap-3">
              <div>
                <Label>Role</Label>
                <Select value={editRole} onValueChange={(v) => setEditRole(v as UserRole)}>
                  <SelectTrigger className="mt-1 rounded-2xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((r) => (
                      <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {editRole === "dealer" && (
                <div>
                  <Label>Linked dealer</Label>
                  <Select value={editDealerId} onValueChange={setEditDealerId}>
                    <SelectTrigger className="mt-1 rounded-2xl">
                      <SelectValue placeholder="Select dealer" />
                    </SelectTrigger>
                    <SelectContent>
                      {(optionsQuery.data?.dealers ?? []).map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name} ({d.code})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {editRole === "distributor" && (
                <div>
                  <Label>Linked distributor</Label>
                  <Select value={editDistributorId} onValueChange={setEditDistributorId}>
                    <SelectTrigger className="mt-1 rounded-2xl">
                      <SelectValue placeholder="Select distributor" />
                    </SelectTrigger>
                    <SelectContent>
                      {(optionsQuery.data?.distributors ?? []).map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {(editRole === "dealer" || editRole === "distributor") && (
                <div>
                  <Label>Pricing tier</Label>
                  <Select value={editTierId} onValueChange={setEditTierId}>
                    <SelectTrigger className="mt-1 rounded-2xl">
                      <SelectValue placeholder="Select tier" />
                    </SelectTrigger>
                    <SelectContent>
                      {(tiersQuery.data?.items ?? []).map((tier) => (
                        <SelectItem key={tier.id} value={tier.id}>
                          {tier.code} — {tier.name} ({tier.distributorMarginPercent}% dist. margin)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Applies to the linked store, so every login on that dealer or distributor uses the same prices.
                  </p>
                </div>
              )}
              {roleDirty && (
                <Button
                  className="rounded-2xl font-bold"
                  onClick={() => {
                    if (editRole !== user.role) setRoleConfirmOpen(true);
                    else void handleSaveRole();
                  }}
                  disabled={actionLoading}
                >
                  Save role changes
                </Button>
              )}
            </div>
          </AdminSection>
        </AdminPermissionGate>

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
        <ConfirmActionDialog
          open={roleConfirmOpen}
          onOpenChange={setRoleConfirmOpen}
          title="Change user role?"
          description={`Change ${user.name}'s role to ${editRole.replace(/_/g, " ")}? This affects portal access immediately.`}
          confirmLabel="Change role"
          onConfirm={handleSaveRole}
          loading={actionLoading}
        />
      </AdminPermissionGate>
    </div>
  );
}
