import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { AdminFilterTabs, AdminFiltersBar } from "@/components/admin/admin-filters-bar";
import { AdminPageHeader, AdminPrimaryButton } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { Badge } from "@/components/ui/badge";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import type { AdminUser } from "@/lib/mock/admin/types";
import { listSignupApplications, listUsers } from "@/services/admin/users";

export const Route = createFileRoute("/admin/users/")({
  validateSearch: (s: Record<string, unknown>) => ({
    tab: (s.tab as string) ?? "all",
  }),
  component: AdminUsersPage,
});

const ROLE_TABS = [
  { value: "all", label: "All" },
  { value: "admin_staff", label: "Admin Staff" },
  { value: "distributor", label: "Distributors" },
  { value: "sales_executive", label: "Sales Execs" },
  { value: "dealer", label: "Dealers" },
  { value: "signup", label: "Pending signups" },
] as const;

function statusBadgeVariant(status: AdminUser["status"]) {
  if (status === "active") return "secondary";
  if (status === "pending_invite") return "default";
  return "destructive";
}

function statusLabel(status: AdminUser["status"]) {
  if (status === "pending_invite") return "Pending invite";
  return status;
}

function AdminUsersPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const { can } = useAdminPermissions();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const roleTab = tab || "all";

  const usersQuery = useAsyncData(
    () =>
      listUsers({
        search,
        page,
        pageSize: 10,
        role: roleTab === "signup" ? "all" : (roleTab as AdminUser["role"] | "all"),
      }),
    [search, page, roleTab],
  );

  const signupsQuery = useAsyncData(
    () => listSignupApplications({ search, page, pageSize: 10 }),
    [search, page, roleTab],
  );

  const isSignupTab = roleTab === "signup";

  if (!can("users:read") && !can("signup:review")) {
    return <ErrorState message="You don't have access to user management." />;
  }

  const loading = isSignupTab ? signupsQuery.loading : usersQuery.loading;
  const error = isSignupTab ? signupsQuery.error : usersQuery.error;
  const result = isSignupTab ? signupsQuery.data : usersQuery.data;

  if (loading) return <PageSkeleton rows={4} />;
  if (error || !result) {
    return (
      <ErrorState
        message={error ?? "Failed to load users"}
        onRetry={() => (isSignupTab ? signupsQuery.retry() : usersQuery.retry())}
      />
    );
  }

  return (
    <div>
      <AdminPageHeader
        title="Users"
        description="Manage admin staff, distributors, sales executives and dealers."
        actions={
          can("users:write") ? (
            <Link to="/admin/users/new">
              <AdminPrimaryButton>Create user</AdminPrimaryButton>
            </Link>
          ) : undefined
        }
      />

      <AdminFiltersBar search={search} onSearchChange={(v) => { setSearch(v); setPage(1); }}>
        <AdminFilterTabs
          value={roleTab}
          onChange={(v) => navigate({ to: "/admin/users", search: { tab: v } })}
          tabs={ROLE_TABS.map((t) => ({ ...t }))}
        />
      </AdminFiltersBar>

      {isSignupTab ? (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            Approve or reject signups from{" "}
            <Link to="/admin/assignments" search={{ tab: "approvals" }} className="font-semibold text-primary">
              Assignments → Pending signups
            </Link>
            .
          </p>
          <AdminDataTable
          data={result.items}
          keyFn={(s) => s.id}
          emptyTitle="No pending signups"
          columns={[
            { key: "business", header: "Business", cell: (s) => <span className="font-bold">{s.businessName}</span> },
            { key: "contact", header: "Contact", cell: (s) => s.contactName },
            { key: "phone", header: "Phone", cell: (s) => s.phone, hideOnMobile: true },
            { key: "city", header: "City", cell: (s) => s.city },
            {
              key: "status",
              header: "Status",
              cell: (s) => (
                <Badge variant={s.status === "pending" ? "default" : "secondary"} className="capitalize">
                  {s.status}
                </Badge>
              ),
            },
          ]}
        />
        </>
      ) : (
        <AdminDataTable
          data={result.items as AdminUser[]}
          keyFn={(u) => u.id}
          onRowClick={(u) => navigate({ to: "/admin/users/$userId", params: { userId: u.id } })}
          emptyTitle="No users found"
          columns={[
            { key: "name", header: "Name", cell: (u) => <span className="font-bold">{u.name}</span> },
            { key: "phone", header: "Phone", cell: (u) => u.phone, hideOnMobile: true },
            {
              key: "role",
              header: "Role",
              cell: (u) => <span className="capitalize">{u.role.replace("_", " ")}</span>,
            },
            {
              key: "linked",
              header: "Linked entity",
              cell: (u) => u.dealerName ?? u.distributorName ?? "—",
              hideOnMobile: true,
            },
            {
              key: "status",
              header: "Status",
              cell: (u) => (
                <Badge variant={statusBadgeVariant(u.status)} className="capitalize">
                  {statusLabel(u.status)}
                </Badge>
              ),
            },
          ]}
        />
      )}

      <AdminPagination page={result.page} totalPages={result.totalPages} onPageChange={setPage} />
    </div>
  );
}
