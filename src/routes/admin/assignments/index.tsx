import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { AdminFilterTabs, AdminFiltersBar } from "@/components/admin/admin-filters-bar";
import { AdminPageHeader, AdminPrimaryButton } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { ConfirmActionDialog } from "@/components/shared/dialogs";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { SignupApplication } from "@/lib/mock/admin/types";
import type { UserRole } from "@/lib/mock/distributor/types";
import type { AssignmentRow } from "@/services/admin/assignments";
import {
  bulkUpdateAssignments,
  getAssignmentOptions,
  getAssignmentSummary,
  listAssignments,
  updateDealerAssignment,
} from "@/services/admin/assignments";
import { listSignupApplications, reviewSignup } from "@/services/admin/users";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/admin/assignments/")({
  validateSearch: (s: Record<string, unknown>) => {
    const tab = s.tab as string;
    if (tab === "sales_executive" || tab === "approvals") return { tab };
    return { tab: "distributor" as const };
  },
  component: AdminAssignmentsPage,
});

const UNASSIGNED_VALUE = "__unassigned__";
const CLEAR_VALUE = "__clear__";

type AssignmentTab = "distributor" | "sales_executive" | "approvals";

const APPROVAL_ROLES: Array<{ value: Exclude<UserRole, "master_admin">; label: string }> = [
  { value: "dealer", label: "Dealer" },
  { value: "distributor", label: "Distributor" },
  { value: "sales_executive", label: "Sales executive" },
  { value: "admin_staff", label: "Admin staff" },
];

function AdminAssignmentsPage() {
  const navigate = useNavigate();
  const { can } = useAdminPermissions();
  const { tab } = Route.useSearch();
  const activeTab: AssignmentTab =
    tab === "sales_executive" ? "sales_executive" : tab === "approvals" ? "approvals" : "distributor";

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [distributorFilter, setDistributorFilter] = useState<string>("all");
  const [seFilter, setSeFilter] = useState<string>("all");
  const [unassignedFilter, setUnassignedFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [editRow, setEditRow] = useState<AssignmentRow | null>(null);
  const [editDistributorId, setEditDistributorId] = useState<string>(CLEAR_VALUE);
  const [editSeId, setEditSeId] = useState<string>(CLEAR_VALUE);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkValue, setBulkValue] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const [reviewSignupRow, setReviewSignupRow] = useState<SignupApplication | null>(null);
  const [approveRole, setApproveRole] = useState<Exclude<UserRole, "master_admin">>("dealer");
  const [approveDistributorId, setApproveDistributorId] = useState<string>("");
  const [approveSeId, setApproveSeId] = useState<string>(CLEAR_VALUE);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");

  const filters = useMemo(() => {
    let unassigned: "distributor" | "sales_executive" | "any" | undefined;
    if (unassignedFilter === "distributor" || unassignedFilter === "sales_executive" || unassignedFilter === "any") {
      unassigned = unassignedFilter;
    }
    if (distributorFilter === UNASSIGNED_VALUE) unassigned = "distributor";
    if (seFilter === UNASSIGNED_VALUE) unassigned = "sales_executive";

    return {
      search,
      page,
      pageSize: 10,
      distributorId:
        distributorFilter !== "all" && distributorFilter !== UNASSIGNED_VALUE ? distributorFilter : undefined,
      salesExecutiveUserId: seFilter !== "all" && seFilter !== UNASSIGNED_VALUE ? seFilter : undefined,
      unassigned,
    };
  }, [search, page, distributorFilter, seFilter, unassignedFilter]);

  const listQuery = useAsyncData(() => listAssignments(filters), [filters]);
  const signupsQuery = useAsyncData(
    () =>
      activeTab === "approvals"
        ? listSignupApplications({ search, page, pageSize: 10, status: "pending" })
        : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 }),
    [search, page, activeTab],
  );
  const summaryQuery = useAsyncData(
    () => (activeTab === "approvals" ? Promise.resolve(null) : getAssignmentSummary()),
    [activeTab],
  );
  const optionsQuery = useAsyncData(() => getAssignmentOptions(), []);

  const navigateTab = (next: AssignmentTab) => {
    navigate({ to: "/admin/assignments", search: { tab: next } });
    setSelectedIds(new Set());
    setBulkValue("");
    setPage(1);
  };

  const refresh = () => {
    listQuery.retry();
    summaryQuery.retry();
  };

  const openEdit = (row: AssignmentRow) => {
    setEditRow(row);
    setEditDistributorId(row.distributorId ?? CLEAR_VALUE);
    setEditSeId(row.salesExecutiveUserId ?? CLEAR_VALUE);
  };

  const needsConfirm = () => {
    if (!editRow) return false;
    if (editDistributorId !== CLEAR_VALUE && editDistributorId !== (editRow.distributorId ?? CLEAR_VALUE)) {
      if (editRow.distributorId) return true;
    }
    if (editSeId !== CLEAR_VALUE && editSeId !== (editRow.salesExecutiveUserId ?? CLEAR_VALUE)) {
      if (editRow.salesExecutiveUserId) return true;
    }
    return false;
  };

  const buildPatch = (distributorId: string, seId: string) => ({
    distributorId: distributorId === CLEAR_VALUE ? null : distributorId,
    salesExecutiveUserId: seId === CLEAR_VALUE ? null : seId,
  });

  const saveEdit = async () => {
    if (!editRow) return;
    setSaving(true);
    try {
      await updateDealerAssignment(editRow.id, buildPatch(editDistributorId, editSeId));
      toast.success("Assignment updated");
      setEditRow(null);
      setConfirmOpen(false);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const handleEditSave = () => {
    if (needsConfirm()) {
      setConfirmOpen(true);
      return;
    }
    void saveEdit();
  };

  const saveBulk = async () => {
    if (!selectedIds.size || !bulkValue) return;
    setSaving(true);
    try {
      const patch =
        activeTab === "distributor"
          ? { distributorId: bulkValue === CLEAR_VALUE ? null : bulkValue }
          : { salesExecutiveUserId: bulkValue === CLEAR_VALUE ? null : bulkValue };
      await bulkUpdateAssignments({ dealerIds: [...selectedIds], ...patch });
      toast.success(`Updated ${selectedIds.size} dealer(s)`);
      setBulkOpen(false);
      setSelectedIds(new Set());
      setBulkValue("");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk update failed");
    } finally {
      setSaving(false);
    }
  };

  const openReview = (row: SignupApplication) => {
    setReviewSignupRow(row);
    setApproveRole("dealer");
    setApproveDistributorId("");
    setApproveSeId(CLEAR_VALUE);
    setRejectNote("");
  };

  const saveApprove = async () => {
    if (!reviewSignupRow) return;
    if (approveRole === "dealer" && !approveDistributorId) {
      toast.error("Select a distributor for dealer approval");
      return;
    }
    if (approveRole === "distributor" && !approveDistributorId) {
      toast.error("Select a distributor record for this user");
      return;
    }
    setSaving(true);
    try {
      await reviewSignup(reviewSignupRow.id, {
        action: "approve",
        role: approveRole,
        distributorId:
          approveRole === "dealer" || approveRole === "distributor"
            ? approveDistributorId || null
            : null,
        salesExecutiveUserId:
          approveRole === "dealer" && approveSeId !== CLEAR_VALUE ? approveSeId : null,
      });
      toast.success("Signup approved");
      setReviewSignupRow(null);
      signupsQuery.retry();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setSaving(false);
    }
  };

  const saveReject = async () => {
    if (!reviewSignupRow) return;
    setSaving(true);
    try {
      await reviewSignup(reviewSignupRow.id, { action: "reject", note: rejectNote || null });
      toast.success("Signup rejected");
      setRejectOpen(false);
      setReviewSignupRow(null);
      signupsQuery.retry();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setSaving(false);
    }
  };

  if (activeTab === "approvals") {
    if (!can("signup:review")) {
      return <ErrorState message="You don't have permission to review signups." />;
    }
    if (signupsQuery.loading && !signupsQuery.data) return <PageSkeleton rows={4} />;
    if (signupsQuery.error || !signupsQuery.data) {
      return (
        <ErrorState
          message={signupsQuery.error ?? "Failed to load pending signups"}
          onRetry={signupsQuery.retry}
        />
      );
    }

    const signupResult = signupsQuery.data;
    const approvalOptions = optionsQuery.data ?? { distributors: [], salesExecutives: [] };

    return (
      <AdminPermissionGate permission="signup:review">
        <div>
          <AdminPageHeader
            title="Assignments"
            description="Review pending signups and assign roles before users can access the app."
          />

          <div className="mb-4 flex flex-wrap gap-2">
            <AdminFilterTabs
              value={activeTab}
              onChange={(v) => navigateTab(v as AssignmentTab)}
              tabs={[
                { value: "distributor", label: "Distributor assignment" },
                { value: "sales_executive", label: "Sales executive assignment" },
                { value: "approvals", label: "Pending signups" },
              ]}
            />
          </div>

          <AdminFiltersBar search={search} onSearchChange={(v) => { setSearch(v); setPage(1); }} />

          <AdminDataTable
            data={signupResult.items}
            keyFn={(s) => s.id}
            emptyTitle="No pending signups"
            columns={[
              { key: "name", header: "Name", cell: (s) => <span className="font-bold">{s.contactName}</span> },
              { key: "phone", header: "Phone", cell: (s) => s.phone, hideOnMobile: true },
              {
                key: "submitted",
                header: "Signup date",
                cell: (s) => new Date(s.submittedAt).toLocaleDateString("en-IN"),
                hideOnMobile: true,
              },
              {
                key: "status",
                header: "Status",
                cell: (s) => (
                  <Badge variant="default" className="capitalize">
                    Pending approval
                  </Badge>
                ),
              },
              { key: "store", header: "Store", cell: (s) => s.businessName },
              {
                key: "distributor",
                header: "Requested distributor",
                cell: (s) => s.distributorName ?? "—",
                hideOnMobile: true,
              },
              {
                key: "actions",
                header: "",
                cell: (s) => (
                  <Button size="sm" className="rounded-xl" onClick={() => openReview(s)}>
                    Review
                  </Button>
                ),
              },
            ]}
          />

          <AdminPagination
            page={signupResult.page}
            totalPages={signupResult.totalPages}
            onPageChange={setPage}
          />

          <Dialog open={!!reviewSignupRow && !rejectOpen} onOpenChange={(o) => !o && setReviewSignupRow(null)}>
            <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto rounded-3xl sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Approve signup</DialogTitle>
                <DialogDescription>
                  Assign a role and relationships before granting access.
                </DialogDescription>
              </DialogHeader>
              {reviewSignupRow && (
                <div className="space-y-4 text-sm">
                  <div className="rounded-2xl bg-secondary/50 p-4">
                    <p className="font-bold">{reviewSignupRow.contactName}</p>
                    <p className="text-muted-foreground">{reviewSignupRow.businessName}</p>
                    <p className="mt-2">{reviewSignupRow.phone}</p>
                    {reviewSignupRow.address && (
                      <p className="mt-1 text-muted-foreground">{reviewSignupRow.address}</p>
                    )}
                    {reviewSignupRow.distributorName && (
                      <p className="mt-2">
                        Requested distributor:{" "}
                        <span className="font-semibold">{reviewSignupRow.distributorName}</span>
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select
                      value={approveRole}
                      onValueChange={(v) => setApproveRole(v as Exclude<UserRole, "master_admin">)}
                    >
                      <SelectTrigger className="rounded-2xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {APPROVAL_ROLES.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {(approveRole === "dealer" || approveRole === "distributor") && (
                    <div className="space-y-2">
                      <Label>Distributor</Label>
                      <Select value={approveDistributorId} onValueChange={setApproveDistributorId}>
                        <SelectTrigger className="rounded-2xl">
                          <SelectValue placeholder="Select distributor" />
                        </SelectTrigger>
                        <SelectContent>
                          {approvalOptions.distributors.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {approveRole === "dealer" && (
                    <div className="space-y-2">
                      <Label>Sales executive (optional)</Label>
                      <Select value={approveSeId} onValueChange={setApproveSeId}>
                        <SelectTrigger className="rounded-2xl">
                          <SelectValue placeholder="Select sales executive" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={CLEAR_VALUE}>Unassigned</SelectItem>
                          {approvalOptions.salesExecutives.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}
              <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-0">
                <Button
                  variant="destructive"
                  className="w-full rounded-2xl sm:mr-auto sm:w-auto"
                  onClick={() => setRejectOpen(true)}
                >
                  Reject
                </Button>
                <Button variant="outline" className="rounded-2xl" onClick={() => setReviewSignupRow(null)}>
                  Cancel
                </Button>
                <Button className="rounded-2xl" disabled={saving} onClick={() => void saveApprove()}>
                  Approve
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
            <DialogContent className="w-[calc(100%-2rem)] rounded-3xl sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Reject signup</DialogTitle>
                <DialogDescription>
                  The applicant will not be able to access the app.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label>Note (optional)</Label>
                <Textarea
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  className="min-h-24 rounded-2xl"
                  placeholder="Reason for rejection (internal)"
                />
              </div>
              <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-0">
                <Button variant="outline" className="rounded-2xl" onClick={() => setRejectOpen(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" className="rounded-2xl" disabled={saving} onClick={() => void saveReject()}>
                  Reject signup
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </AdminPermissionGate>
    );
  }

  if (listQuery.loading && !listQuery.data) return <PageSkeleton rows={4} />;
  if (listQuery.error || !listQuery.data) {
    return <ErrorState message={listQuery.error ?? "Failed to load assignments"} onRetry={listQuery.retry} />;
  }

  const options = optionsQuery.data;
  const summary = summaryQuery.data;

  return (
    <AdminPermissionGate permission="assignments:read" fallback={<ErrorState message="Master admin access required." />}>
      <div>
        <AdminPageHeader
          title="Assignments"
          description="Assign dealers to distributors and sales executives. Changes apply immediately to access scope."
        />

        <div className="mb-4 flex flex-wrap gap-2">
          <AdminFilterTabs
            value={activeTab}
            onChange={(v) => navigateTab(v as AssignmentTab)}
            tabs={[
              { value: "distributor", label: "Distributor assignment" },
              { value: "sales_executive", label: "Sales executive assignment" },
              ...(can("signup:review")
                ? [{ value: "approvals" as const, label: "Pending signups" }]
                : []),
            ]}
          />
        </div>

        {summary && (
          <div className="mb-4 flex flex-wrap gap-2 text-sm">
            <Badge variant="secondary">Distributors ({summary.distributors.length})</Badge>
            <Badge variant="secondary">SEs ({summary.salesExecutives.length})</Badge>
            <Badge variant="outline">Unassigned distributor ({summary.unassignedDistributor})</Badge>
            <Badge variant="outline">Unassigned SE ({summary.unassignedSalesExecutive})</Badge>
          </div>
        )}

        <AdminFiltersBar
          search={search}
          onSearchChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          searchPlaceholder="Search dealers…"
        >
          <Select
            value={distributorFilter}
            onValueChange={(v) => {
              setDistributorFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[180px] rounded-2xl">
              <SelectValue placeholder="Distributor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All distributors</SelectItem>
              <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
              {options?.distributors.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={seFilter}
            onValueChange={(v) => {
              setSeFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[180px] rounded-2xl">
              <SelectValue placeholder="Sales executive" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All SEs</SelectItem>
              <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
              {options?.salesExecutives.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={unassignedFilter}
            onValueChange={(v) => {
              setUnassignedFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[160px] rounded-2xl">
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              <SelectItem value="distributor">No distributor</SelectItem>
              <SelectItem value="sales_executive">No SE</SelectItem>
              <SelectItem value="any">Either missing</SelectItem>
            </SelectContent>
          </Select>
        </AdminFiltersBar>

        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select dealers for bulk assignment"}
          </p>
          <AdminPrimaryButton
            disabled={selectedIds.size === 0}
            onClick={() => {
              setBulkValue("");
              setBulkOpen(true);
            }}
          >
            Bulk assign…
          </AdminPrimaryButton>
        </div>

        <AdminDataTable
          data={listQuery.data.items}
          keyFn={(r) => r.id}
          emptyTitle="No dealers match filters"
          selection={{
            selectedIds,
            onToggle: (id, checked) => {
              setSelectedIds((prev) => {
                const next = new Set(prev);
                if (checked) next.add(id);
                else next.delete(id);
                return next;
              });
            },
            onToggleAll: (checked) => {
              if (!checked) {
                setSelectedIds(new Set());
                return;
              }
              setSelectedIds(new Set(listQuery.data!.items.map((r) => r.id)));
            },
          }}
          columns={[
            { key: "dealer", header: "Dealer", cell: (r) => <span className="font-bold">{r.name}</span> },
            { key: "code", header: "Code", cell: (r) => r.code, hideOnMobile: true },
            { key: "distributor", header: "Distributor", cell: (r) => r.distributorName ?? "—" },
            { key: "se", header: "Sales executive", cell: (r) => r.salesExecutiveName ?? "—" },
            {
              key: "status",
              header: "Status",
              cell: (r) => (
                <Badge variant={r.active ? "secondary" : "destructive"}>{r.active ? "Active" : "Inactive"}</Badge>
              ),
              hideOnMobile: true,
            },
            {
              key: "actions",
              header: "Actions",
              cell: (r) => (
                <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => openEdit(r)}>
                  Edit
                </Button>
              ),
            },
          ]}
        />

        <AdminPagination page={listQuery.data.page} totalPages={listQuery.data.totalPages} onPageChange={setPage} />

        <Dialog open={!!editRow} onOpenChange={(open) => !open && setEditRow(null)}>
          <DialogContent className="rounded-3xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit assignment</DialogTitle>
              <DialogDescription>
                {editRow ? `${editRow.name} (${editRow.code})` : "Update distributor and sales executive."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Distributor</Label>
                <Select value={editDistributorId} onValueChange={setEditDistributorId}>
                  <SelectTrigger className="rounded-2xl">
                    <SelectValue placeholder="Select distributor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CLEAR_VALUE}>Unassigned</SelectItem>
                    {options?.distributors.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sales executive</Label>
                <Select value={editSeId} onValueChange={setEditSeId}>
                  <SelectTrigger className="rounded-2xl">
                    <SelectValue placeholder="Select sales executive" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CLEAR_VALUE}>Unassigned</SelectItem>
                    {options?.salesExecutives.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" className="rounded-2xl" onClick={() => setEditRow(null)}>
                Cancel
              </Button>
              <Button className="rounded-2xl" onClick={handleEditSave} disabled={saving}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmActionDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Replace existing assignment?"
          description="This dealer already has an assignee for one or more fields. Continuing will overwrite the current assignment."
          confirmLabel="Replace"
          onConfirm={() => void saveEdit()}
          loading={saving}
        />

        <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
          <DialogContent className="rounded-3xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                Bulk assign {activeTab === "distributor" ? "distributor" : "sales executive"}
              </DialogTitle>
              <DialogDescription>Apply to {selectedIds.size} selected dealer(s).</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>{activeTab === "distributor" ? "Distributor" : "Sales executive"}</Label>
              <Select value={bulkValue} onValueChange={setBulkValue}>
                <SelectTrigger className="rounded-2xl">
                  <SelectValue placeholder="Choose assignee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CLEAR_VALUE}>Clear assignment</SelectItem>
                  {activeTab === "distributor"
                    ? options?.distributors.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))
                    : options?.salesExecutives.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" className="rounded-2xl" onClick={() => setBulkOpen(false)}>
                Cancel
              </Button>
              <Button className="rounded-2xl" disabled={!bulkValue || saving} onClick={() => void saveBulk()}>
                Apply
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminPermissionGate>
  );
}
