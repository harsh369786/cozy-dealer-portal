import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { AdminFilterTabs, AdminFiltersBar } from "@/components/admin/admin-filters-bar";
import { AdminPageHeader, AdminPrimaryButton } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
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

function statusBadgeVariant(status: AdminUser["status"]) {
  if (status === "active") return "secondary";
  if (status === "pending_invite") return "default";
  return "destructive";
}

function AdminUsersPage() {
  const { t } = useTranslation();
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const { can, loading: permissionsLoading } = useAdminPermissions();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const roleTab = tab || "all";

  const roleTabs = useMemo(
    () => [
      { value: "all", label: t("admin.users.tabs.all") },
      { value: "admin_staff", label: t("admin.users.tabs.adminStaff") },
      { value: "distributor", label: t("admin.users.tabs.distributors") },
      { value: "sales_executive", label: t("admin.users.tabs.salesExecs") },
      { value: "dealer", label: t("admin.users.tabs.dealers") },
      { value: "signup", label: t("admin.users.tabs.pendingSignups") },
    ],
    [t],
  );

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

  if (permissionsLoading) return <PageSkeleton rows={4} />;

  if (!can("users:read") && !can("signup:review")) {
    return <ErrorState message={t("errors.noAccessUserManagement")} />;
  }

  const loading = isSignupTab ? signupsQuery.loading : usersQuery.loading;
  const error = isSignupTab ? signupsQuery.error : usersQuery.error;
  const result = isSignupTab ? signupsQuery.data : usersQuery.data;

  if (loading) return <PageSkeleton rows={4} />;
  if (error || !result) {
    return (
      <ErrorState
        message={error ?? t("errors.failedToLoadUsers")}
        onRetry={() => (isSignupTab ? signupsQuery.retry() : usersQuery.retry())}
      />
    );
  }

  const statusLabel = (status: AdminUser["status"]) =>
    status === "pending_invite" ? t("admin.users.statusPendingInvite") : status;

  return (
    <div>
      <AdminPageHeader
        title={t("admin.users.title")}
        description={t("admin.users.description")}
        actions={
          can("users:write") ? (
            <Link to="/admin/users/new">
              <AdminPrimaryButton>{t("admin.users.createUser")}</AdminPrimaryButton>
            </Link>
          ) : undefined
        }
      />

      <AdminFiltersBar search={search} onSearchChange={(v) => { setSearch(v); setPage(1); }}>
        <AdminFilterTabs
          value={roleTab}
          onChange={(v) => navigate({ to: "/admin/users", search: { tab: v } })}
          tabs={roleTabs}
        />
      </AdminFiltersBar>

      {isSignupTab ? (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            {t("admin.assignments.descriptionSignups")}{" "}
            <Link to="/admin/assignments" search={{ tab: "approvals" }} className="font-semibold text-primary">
              {t("nav.admin.assignments")} → {t("nav.admin.pendingSignups")}
            </Link>
            .
          </p>
          <AdminDataTable
            data={result.items}
            keyFn={(s) => s.id}
            onRowClick={(s) =>
              navigate({ to: "/admin/assignments", search: { tab: "approvals", signupId: s.id } })
            }
            emptyTitle={t("admin.dashboard.pendingSignups")}
            columns={[
              { key: "business", header: t("common.storeName"), cell: (s) => <span className="font-bold">{s.businessName}</span> },
              { key: "contact", header: t("common.contactName"), cell: (s) => s.contactName },
              { key: "phone", header: t("common.mobile"), cell: (s) => s.phone, hideOnMobile: true },
              { key: "city", header: t("common.region"), cell: (s) => s.city },
              {
                key: "status",
                header: t("common.status"),
                cell: (s) => (
                  <Badge variant={s.status === "pending" ? "default" : "secondary"} className="capitalize">
                    {s.status === "pending" ? t("common.pending") : s.status}
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
          emptyTitle={t("common.noMatchingResults")}
          columns={[
            { key: "name", header: t("common.name"), cell: (u) => <span className="font-bold">{u.name}</span> },
            { key: "phone", header: t("common.mobile"), cell: (u) => u.phone, hideOnMobile: true },
            {
              key: "role",
              header: t("common.status"),
              cell: (u) => <span className="capitalize">{u.role.replace("_", " ")}</span>,
            },
            {
              key: "linked",
              header: t("admin.users.assignments"),
              cell: (u) => u.dealerName ?? u.distributorName ?? "—",
              hideOnMobile: true,
            },
            {
              key: "status",
              header: t("common.status"),
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
