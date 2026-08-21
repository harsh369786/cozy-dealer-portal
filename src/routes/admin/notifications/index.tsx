import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Pencil, Power } from "lucide-react";
import { toast } from "sonner";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { AdminFilterTabs, AdminFiltersBar } from "@/components/admin/admin-filters-bar";
import { AdminPageHeader, AdminPrimaryButton } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import type { AdminNotification, AdminNotificationInput, NotificationAudience } from "@/lib/mock/admin/types";
import type { NotificationCategory } from "@/lib/mock/distributor/types";
import {
  AUDIENCE_LABELS,
  activateNotification,
  composeAnnouncement,
  deactivateNotification,
  listNotifications,
  updateNotification,
} from "@/services/admin/notifications";

export const Route = createFileRoute("/admin/notifications/")({
  component: AdminNotificationsPage,
});

const CATEGORY_TABS: Array<{ value: NotificationCategory | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "orders", label: "Orders" },
  { value: "campaigns", label: "Campaigns" },
  { value: "complaints", label: "Complaints" },
  { value: "system", label: "System" },
];

const ACTIVE_TABS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
] as const;

const emptyForm = (): AdminNotificationInput => ({
  title: "",
  body: "",
  category: "system",
  audience: "all_dealers",
  sendAt: new Date().toISOString().slice(0, 16),
  popupEnabled: false,
  maxImpressions: 1,
});

function NotificationForm({
  form,
  onChange,
}: {
  form: AdminNotificationInput;
  onChange: (f: AdminNotificationInput) => void;
}) {
  const patch = (p: Partial<AdminNotificationInput>) => onChange({ ...form, ...p });

  return (
    <div className="space-y-3">
      <div>
        <Label>Title</Label>
        <Input value={form.title} onChange={(e) => patch({ title: e.target.value })} className="mt-1 rounded-2xl" />
      </div>
      <div>
        <Label>Message</Label>
        <Textarea value={form.body} onChange={(e) => patch({ body: e.target.value })} className="mt-1 rounded-2xl" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Category</Label>
          <Select value={form.category} onValueChange={(v) => patch({ category: v as NotificationCategory })}>
            <SelectTrigger className="mt-1 rounded-2xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">System</SelectItem>
              <SelectItem value="campaigns">Campaigns</SelectItem>
              <SelectItem value="orders">Orders</SelectItem>
              <SelectItem value="complaints">Complaints</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Audience (who)</Label>
          <Select value={form.audience} onValueChange={(v) => patch({ audience: v as NotificationAudience })}>
            <SelectTrigger className="mt-1 rounded-2xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(AUDIENCE_LABELS) as NotificationAudience[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {AUDIENCE_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Send at (when)</Label>
        <Input
          type="datetime-local"
          value={form.sendAt}
          onChange={(e) => patch({ sendAt: e.target.value })}
          className="mt-1 rounded-2xl"
        />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="popup"
          checked={form.popupEnabled}
          onCheckedChange={(v) => patch({ popupEnabled: v === true })}
        />
        <Label htmlFor="popup" className="cursor-pointer font-normal">
          Show as in-app popup
        </Label>
      </div>
      <div>
        <Label>Max popup impressions (how many times)</Label>
        <Input
          type="number"
          min={1}
          max={10}
          value={form.maxImpressions}
          onChange={(e) => patch({ maxImpressions: Number(e.target.value) || 1 })}
          className="mt-1 rounded-2xl"
          disabled={!form.popupEnabled}
        />
      </div>
    </div>
  );
}

function AdminNotificationsPage() {
  return (
    <AdminPermissionGate permission="notifications:read">
      <NotificationsContent />
    </AdminPermissionGate>
  );
}

function NotificationsContent() {
  const { can } = useAdminPermissions();
  const canWrite = can("campaigns:write");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<NotificationCategory | "all">("all");
  const [activeTab, setActiveTab] = useState<(typeof ACTIVE_TABS)[number]["value"]>("all");
  const [page, setPage] = useState(1);
  const [composeOpen, setComposeOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const { data, loading, error, retry } = useAsyncData(
    () =>
      listNotifications({
        search,
        category,
        active: activeTab,
        page,
        pageSize: 10,
      }),
    [search, category, activeTab, page],
  );

  const openEdit = (n: AdminNotification) => {
    setEditingId(n.id);
    setForm({
      title: n.title,
      body: n.body,
      category: n.category,
      audience: n.audience,
      sendAt: n.sendAt.includes("T") ? n.sendAt.slice(0, 16) : n.sendAt,
      popupEnabled: n.popupEnabled,
      maxImpressions: n.maxImpressions,
    });
    setEditOpen(true);
  };

  const handleCompose = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      toast.error("Title and body are required");
      return;
    }
    setSaving(true);
    try {
      await composeAnnouncement(form);
      toast.success("Notification scheduled");
      setComposeOpen(false);
      setForm(emptyForm());
      retry();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      await updateNotification(editingId, form);
      toast.success("Notification updated");
      setEditOpen(false);
      retry();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (n: AdminNotification) => {
    try {
      if (n.active) {
        await deactivateNotification(n.id);
        toast.success("Notification deactivated");
      } else {
        await activateNotification(n.id);
        toast.success("Notification activated");
      }
      retry();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  if (loading) return <PageSkeleton rows={4} />;
  if (error || !data) return <ErrorState message={error ?? "Failed to load notifications"} onRetry={retry} />;

  return (
    <div>
      <AdminPageHeader
        title="Notifications"
        description="Control when notifications send, who receives them, and popup behaviour."
        actions={
          canWrite ? (
            <AdminPrimaryButton onClick={() => { setForm(emptyForm()); setComposeOpen(true); }}>
              Create notification
            </AdminPrimaryButton>
          ) : null
        }
      />

      <AdminFiltersBar search={search} onSearchChange={(v) => { setSearch(v); setPage(1); }}>
        <AdminFilterTabs
          value={category}
          onChange={(v) => { setCategory(v as NotificationCategory | "all"); setPage(1); }}
          tabs={CATEGORY_TABS}
        />
        <AdminFilterTabs
          value={activeTab}
          onChange={(v) => { setActiveTab(v as typeof activeTab); setPage(1); }}
          tabs={[...ACTIVE_TABS]}
        />
      </AdminFiltersBar>

      <AdminDataTable
        data={data.items}
        keyFn={(n) => n.id}
        emptyTitle="No notifications"
        columns={[
          { key: "title", header: "Title", cell: (n) => <span className="font-bold">{n.title}</span> },
          { key: "category", header: "Category", cell: (n) => <Badge variant="secondary" className="capitalize">{n.category}</Badge> },
          { key: "audience", header: "To whom", cell: (n) => n.recipientScope, hideOnMobile: true },
          { key: "when", header: "Send at", cell: (n) => n.sendAt, hideOnMobile: true },
          {
            key: "popup",
            header: "Popup",
            cell: (n) => (n.popupEnabled ? `Yes · max ${n.maxImpressions}` : "No"),
            hideOnMobile: true,
          },
          {
            key: "active",
            header: "Status",
            cell: (n) => (
              <Badge variant={n.active ? "secondary" : "outline"}>{n.active ? "Active" : "Inactive"}</Badge>
            ),
          },
          {
            key: "actions",
            header: "",
            cell: (n) => (
              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => openEdit(n)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                {canWrite && (
                  <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => toggleActive(n)}>
                    <Power className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ),
          },
        ]}
      />

      <AdminPagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />

      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create notification</DialogTitle>
          </DialogHeader>
          <NotificationForm form={form} onChange={setForm} />
          <DialogFooter>
            <AdminPrimaryButton onClick={handleCompose} disabled={saving}>
              {saving ? "Saving…" : "Schedule"}
            </AdminPrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit notification</DialogTitle>
          </DialogHeader>
          <NotificationForm form={form} onChange={setForm} />
          <DialogFooter>
            <AdminPrimaryButton onClick={handleUpdate} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </AdminPrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
