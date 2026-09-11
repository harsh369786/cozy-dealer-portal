import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Power, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { AdminFilterTabs, AdminFiltersBar } from "@/components/admin/admin-filters-bar";
import { AdminPageHeader, AdminPrimaryButton } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { NotificationItem } from "@/components/shared/notification-item";
import { ConfirmActionDialog } from "@/components/shared/dialogs";
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
  AUDIENCE_OPTIONS,
  activateNotification,
  composeAnnouncement,
  deactivateNotification,
  deleteNotification,
  listNotifications as listAnnouncements,
  resendNotification,
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
  audiences: ["all_dealers"],
  sendAt: new Date().toISOString().slice(0, 16),
  popupEnabled: false,
  maxImpressions: 1,
  popupMaxPerDay: 1,
});

// The <input type="datetime-local"> value is a naive local wall-clock string ("2026-09-04T11:10",
// no timezone). Convert it to a real UTC ISO instant before sending, so the server (which runs in
// UTC) schedules it for the moment the admin actually intended instead of misreading it as UTC.
function toIsoInstant(localDateTime: string): string {
  const d = new Date(localDateTime);
  if (Number.isNaN(d.getTime())) return localDateTime; // let the server validate/reject
  return d.toISOString();
}

function withNormalizedSendAt(form: AdminNotificationInput): AdminNotificationInput {
  return { ...form, sendAt: toIsoInstant(form.sendAt) };
}

function NotificationForm({
  form,
  onChange,
  sendMode,
  onSendModeChange,
}: {
  form: AdminNotificationInput;
  onChange: (f: AdminNotificationInput) => void;
  sendMode: "now" | "schedule";
  onSendModeChange: (m: "now" | "schedule") => void;
}) {
  const patch = (p: Partial<AdminNotificationInput>) => onChange({ ...form, ...p });
  const selected = new Set(form.audiences ?? []);
  const toggleAudience = (key: NotificationAudience, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(key);
    else next.delete(key);
    patch({ audiences: [...next] as NotificationAudience[] });
  };

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

      {/* Audience — multi-select */}
      <div>
        <Label>Audience (select one or more)</Label>
        <div className="mt-1 grid gap-2 rounded-2xl border border-border p-3 sm:grid-cols-2">
          {AUDIENCE_OPTIONS.map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={selected.has(key)}
                onCheckedChange={(v) => toggleAudience(key, v === true)}
              />
              {AUDIENCE_LABELS[key]}
            </label>
          ))}
        </div>
        {selected.size === 0 ? (
          <p className="mt-1 text-xs text-destructive">Select at least one audience.</p>
        ) : null}
      </div>

      {/* Send Now / Schedule */}
      <div>
        <Label>Delivery</Label>
        <div className="mt-1 flex gap-2">
          <Button
            type="button"
            variant={sendMode === "now" ? "default" : "outline"}
            className="rounded-2xl font-bold"
            onClick={() => onSendModeChange("now")}
          >
            Send now
          </Button>
          <Button
            type="button"
            variant={sendMode === "schedule" ? "default" : "outline"}
            className="rounded-2xl font-bold"
            onClick={() => onSendModeChange("schedule")}
          >
            Schedule
          </Button>
        </div>
        {sendMode === "schedule" ? (
          <div className="mt-2">
            <Label>Send at (IST)</Label>
            <Input
              type="datetime-local"
              value={form.sendAt}
              onChange={(e) => patch({ sendAt: e.target.value })}
              className="mt-1 rounded-2xl"
            />
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="popup"
          checked={form.popupEnabled}
          onCheckedChange={(v) => patch({ popupEnabled: v === true })}
        />
        <Label htmlFor="popup" className="cursor-pointer font-normal">
          Show as in-app pop-up
        </Label>
      </div>
      <div>
        <Label>Pop-up frequency — times per day (per user)</Label>
        <Input
          type="number"
          min={1}
          max={10}
          value={form.popupMaxPerDay}
          onChange={(e) => patch({ popupMaxPerDay: Math.max(1, Number(e.target.value) || 1) })}
          className="mt-1 rounded-2xl"
          disabled={!form.popupEnabled}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Default 1 per day. Limits how many times the pop-up appears to each user per day.
        </p>
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
  const [sendMode, setSendMode] = useState<"now" | "schedule">("now");
  const [saving, setSaving] = useState(false);
  // Send Again dialog state.
  const [resendTarget, setResendTarget] = useState<AdminNotification | null>(null);
  const [resendMode, setResendMode] = useState<"now" | "schedule">("now");
  const [resendSendAt, setResendSendAt] = useState<string>(new Date().toISOString().slice(0, 16));
  const [resending, setResending] = useState(false);
  // Delete confirm state.
  const [deleteTarget, setDeleteTarget] = useState<AdminNotification | null>(null);
  const [deleting, setDeleting] = useState(false);
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
      audiences: n.audiences && n.audiences.length ? n.audiences : n.audience ? [n.audience] : ["all_dealers"],
      sendAt: n.sendAt && n.sendAt.includes("T") ? n.sendAt.slice(0, 16) : new Date().toISOString().slice(0, 16),
      popupEnabled: n.popupEnabled,
      maxImpressions: n.maxImpressions,
      popupMaxPerDay: n.popupMaxPerDay ?? 1,
    });
    setSendMode("now");
    setEditOpen(true);
  };

  // For Send Now, deliver at "now" (server treats non-future sendAt as immediate). For Schedule,
  // send the chosen instant. resolveSendAt normalizes to a UTC ISO instant.
  const resolveComposeSendAt = () =>
    sendMode === "now" ? new Date().toISOString() : toIsoInstant(form.sendAt);

  const handleCompose = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      toast.error("Title and message are required");
      return;
    }
    if (!form.audiences || form.audiences.length === 0) {
      toast.error("Select at least one audience");
      return;
    }
    setSaving(true);
    try {
      await composeAnnouncement({ ...form, sendAt: resolveComposeSendAt() });
      toast.success(sendMode === "now" ? "Notification sent" : "Notification scheduled");
      setComposeOpen(false);
      setForm(emptyForm());
      setSendMode("now");
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
      await updateNotification(editingId, { ...form, sendAt: resolveComposeSendAt() });
      toast.success("Notification updated");
      setEditOpen(false);
      retry();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const handleResend = async () => {
    if (!resendTarget) return;
    setResending(true);
    try {
      await resendNotification(resendTarget.id, {
        mode: resendMode,
        sendAt: resendMode === "schedule" ? toIsoInstant(resendSendAt) : undefined,
      });
      toast.success(resendMode === "now" ? "Notification sent again" : "Re-send scheduled");
      setResendTarget(null);
      retry();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send again");
    } finally {
      setResending(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteNotification(deleteTarget.id);
      toast.success("Notification deleted");
      setDeleteTarget(null);
      retry();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeleting(false);
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
          {
            key: "sends",
            header: "Sends",
            cell: (n) =>
              n.scheduled
                ? `Scheduled · ${n.nextSendAt ?? n.sendAt}`
                : n.sendCount != null
                  ? `Sent ${n.sendCount}×`
                  : n.sendAt,
            hideOnMobile: true,
          },
          {
            key: "popup",
            header: "Popup",
            cell: (n) => (n.popupEnabled ? `Yes · ${n.popupMaxPerDay ?? 1}/day` : "No"),
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
                {canWrite && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-xl"
                    aria-label="Send again"
                    title="Send again"
                    onClick={() => {
                      setResendTarget(n);
                      setResendMode("now");
                      setResendSendAt(new Date().toISOString().slice(0, 16));
                    }}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => openEdit(n)} disabled={!canWrite}>
                  <Pencil className="h-4 w-4" />
                </Button>
                {canWrite && (
                  <Button size="sm" variant="ghost" className="rounded-xl" aria-label="Toggle active" onClick={() => toggleActive(n)}>
                    <Power className="h-4 w-4" />
                  </Button>
                )}
                {canWrite && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-xl text-destructive"
                    aria-label="Delete"
                    onClick={() => setDeleteTarget(n)}
                  >
                    <Trash2 className="h-4 w-4" />
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
          <NotificationForm form={form} onChange={setForm} sendMode={sendMode} onSendModeChange={setSendMode} />
          <DialogFooter>
            <AdminPrimaryButton onClick={handleCompose} disabled={saving}>
              {saving ? t("common.saving") : sendMode === "now" ? "Send now" : "Schedule"}
            </AdminPrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit notification</DialogTitle>
          </DialogHeader>
          <NotificationForm form={form} onChange={setForm} sendMode={sendMode} onSendModeChange={setSendMode} />
          <DialogFooter>
            <AdminPrimaryButton onClick={handleUpdate} disabled={saving}>
              {saving ? t("common.saving") : "Save changes"}
            </AdminPrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Again */}
      <Dialog open={resendTarget != null} onOpenChange={(open) => { if (!open) setResendTarget(null); }}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send again</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Re-send <span className="font-semibold">{resendTarget?.title}</span> to its saved
              audience ({resendTarget ? resendTarget.recipientScope : ""}). This creates a new send;
              past sends and their history are unchanged.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={resendMode === "now" ? "default" : "outline"}
                className="rounded-2xl font-bold"
                onClick={() => setResendMode("now")}
              >
                Send now
              </Button>
              <Button
                type="button"
                variant={resendMode === "schedule" ? "default" : "outline"}
                className="rounded-2xl font-bold"
                onClick={() => setResendMode("schedule")}
              >
                Schedule
              </Button>
            </div>
            {resendMode === "schedule" ? (
              <div>
                <Label>Send at (IST)</Label>
                <Input
                  type="datetime-local"
                  value={resendSendAt}
                  onChange={(e) => setResendSendAt(e.target.value)}
                  className="mt-1 rounded-2xl"
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <AdminPrimaryButton onClick={handleResend} disabled={resending}>
              {resending ? t("common.saving") : resendMode === "now" ? "Send now" : "Schedule"}
            </AdminPrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={deleteTarget != null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete notification?"
        description="This removes the notification and its send history. It cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        loading={deleting}
        variant="destructive"
      />
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
