import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Power } from "lucide-react";
import { toast } from "sonner";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { AdminFilterTabs, AdminFiltersBar } from "@/components/admin/admin-filters-bar";
import { AdminPageHeader, AdminPrimaryButton } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { NotificationItem } from "@/components/shared/notification-item";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/shared/states";
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
import { cn } from "@/lib/utils";
import {
  AUDIENCE_LABELS,
  activateNotification,
  composeAnnouncement,
  deactivateNotification,
  listNotifications as listAnnouncements,
  updateNotification,
} from "@/services/admin/notifications";
import {
  getNotifications,
  getNotificationsByCategory,
  markAllRead,
  markNotificationRead,
  sendTestNotification,
} from "@/services/notifications";
import {
  getNotificationPermission,
  isPushSupported,
  subscribeToPush,
  hasActivePushSubscription,
} from "@/lib/browser-notifications";

export const Route = createFileRoute("/admin/notifications/")({
  component: AdminNotificationsPage,
});

const PAGE_TABS = [
  { value: "inbox", label: "Inbox" },
  { value: "announcements", label: "Announcements" },
] as const;

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

function AdminInbox() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<NotificationCategory | "all">("all");
  const [items, setItems] = useState<Awaited<ReturnType<typeof getNotifications>>>([]);

  const { loading, error, retry } = useAsyncData(async () => {
    const data =
      filter === "all" ? await getNotifications() : await getNotificationsByCategory(filter);
    setItems(data);
    return data;
  }, [filter]);

  const handleRead = async (id: string) => {
    await markNotificationRead(id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const handleMarkAll = async () => {
    await markAllRead();
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  if (loading) return <PageSkeleton rows={4} />;
  if (error) return <ErrorState message={error} onRetry={retry} />;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="scrollbar-none flex gap-2 overflow-x-auto scroll-smooth-touch pb-1">
          {CATEGORY_TABS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "press shrink-0 rounded-full px-3 py-1.5 text-xs font-bold",
                filter === f.value ? "bg-primary text-primary-foreground" : "bg-secondary",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={handleMarkAll} className="shrink-0 text-xs">
          Mark all read
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState title={t("notifications.noNotifications")} description={t("notifications.allCaughtUp")} />
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <NotificationItem key={n.id} notification={n} onRead={handleRead} />
          ))}
        </div>
      )}
    </div>
  );
}

function AnnouncementsManager() {
  const { t } = useTranslation();
  const { can } = useAdminPermissions();
  const canWrite = can("settings:write");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<NotificationCategory | "all">("all");
  const [activeTab, setActiveTab] = useState<(typeof ACTIVE_TABS)[number]["value"]>("all");
  const [page, setPage] = useState(1);
  const [composeOpen, setComposeOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const pushSupported = isPushSupported();
  // Track whether THIS device actually has a saved push subscription — not merely whether
  // the browser permission is "granted". Granting permission alone does not subscribe the
  // device or save it to the server, so the test send would have no endpoint to reach.
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    let active = true;
    hasActivePushSubscription().then((has) => {
      if (active) setSubscribed(has);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleEnablePush = async () => {
    setEnabling(true);
    try {
      const ok = await subscribeToPush();
      if (ok) {
        setSubscribed(true);
        toast.success("Notifications enabled on this device");
      } else {
        const perm = getNotificationPermission();
        toast.error(
          perm === "denied"
            ? "Notifications are blocked. Enable them in your browser/OS settings."
            : "Could not enable notifications on this device.",
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to enable notifications");
    } finally {
      setEnabling(false);
    }
  };

  const handleSendTest = async () => {
    setSendingTest(true);
    try {
      await sendTestNotification();
      toast.success("Test notification sent");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send test notification");
    } finally {
      setSendingTest(false);
    }
  };

  const { data, loading, error, retry } = useAsyncData(
    () =>
      listAnnouncements({
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
      toast.error(e instanceof Error ? e.message : t("errors.saveFailed"));
    }
  };

  if (loading) return <PageSkeleton rows={4} />;
  if (error || !data) return <ErrorState message={error ?? "Failed to load notifications"} onRetry={retry} />;

  return (
    <div>
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        {pushSupported && !subscribed ? (
          <Button variant="outline" onClick={handleEnablePush} disabled={enabling} className="rounded-2xl">
            {enabling ? t("common.saving") : "Enable notifications"}
          </Button>
        ) : null}
        {pushSupported && subscribed ? (
          <Button variant="outline" onClick={handleSendTest} disabled={sendingTest} className="rounded-2xl">
            {sendingTest ? t("common.saving") : "Send test notification"}
          </Button>
        ) : null}
        {canWrite ? (
          <AdminPrimaryButton onClick={() => { setForm(emptyForm()); setComposeOpen(true); }}>
            Create notification
          </AdminPrimaryButton>
        ) : null}
      </div>

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
            cell: (n) => (n.popupEnabled ? `Yes Â· max ${n.maxImpressions}` : "No"),
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
                <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => openEdit(n)} disabled={!canWrite}>
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
              {saving ? t("common.saving") : "Schedule"}
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
              {saving ? t("common.saving") : "Save changes"}
            </AdminPrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NotificationsContent() {
  const { t } = useTranslation();
  const pageTabs = useMemo(
    () => [
      { value: "inbox" as const, label: t("admin.notifications.tabs.inbox") },
      { value: "announcements" as const, label: t("admin.notifications.tabs.announcements") },
    ],
    [t],
  );
  const [pageTab, setPageTab] = useState<(typeof pageTabs)[number]["value"]>("inbox");

  return (
    <div>
      <AdminPageHeader
        title={t("admin.notifications.title")}
        description={
          pageTab === "inbox"
            ? t("admin.notifications.descriptionInbox")
            : t("admin.notifications.descriptionAnnouncements")
        }
      />

      <div className="mb-6">
        <AdminFilterTabs
          value={pageTab}
          onChange={(v) => setPageTab(v as typeof pageTab)}
          tabs={pageTabs}
        />
      </div>

      {pageTab === "inbox" ? <AdminInbox /> : <AnnouncementsManager />}
    </div>
  );
}
