import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSection } from "@/components/admin/admin-section";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import type { SystemSetting } from "@/lib/mock/admin/types";
import { getSettings, updateSetting } from "@/services/admin/settings";

export const Route = createFileRoute("/admin/settings/")({
  component: AdminSettingsPage,
});

const GROUP_LABELS: Record<SystemSetting["group"], string> = {
  otp: "OTP & authentication",
  reminders: "Order reminders",
  features: "Feature flags",
  notifications: "Notification defaults",
};

function AdminSettingsPage() {
  const { can } = useAdminPermissions();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data, loading, error, retry } = useAsyncData(async () => {
    const settings = await getSettings();
    const map: Record<string, string> = {};
    for (const s of settings) map[s.key] = s.value;
    setDraft(map);
    return settings;
  }, []);

  const readOnly = !can("settings:write");

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all(Object.entries(draft).map(([key, value]) => updateSetting(key, value)));
      toast.success("Settings saved");
      retry();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageSkeleton rows={4} />;
  if (error || !data) return <ErrorState message={error ?? "Failed to load settings"} onRetry={retry} />;

  const groups = [...new Set(data.map((s) => s.group))];

  return (
    <div>
      <AdminPageHeader
        title="Settings"
        description="System configuration and feature flags."
        actions={
          !readOnly ? (
            <Button className="rounded-2xl font-bold" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          ) : undefined
        }
      />

      {readOnly && (
        <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Read-only view — only Master Admin can edit settings.
        </p>
      )}

      <div className="space-y-6">
        {groups.map((group) => (
          <AdminSection key={group} title={GROUP_LABELS[group]}>
            <div className="grid max-w-lg gap-4">
              {data
                .filter((s) => s.group === group)
                .map((s) => (
                  <div key={s.key}>
                    <Label htmlFor={s.key}>{s.label}</Label>
                    {s.description && (
                      <p className="text-xs text-muted-foreground">{s.description}</p>
                    )}
                    <Input
                      id={s.key}
                      value={draft[s.key] ?? s.value}
                      disabled={readOnly}
                      onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))}
                      className="mt-1 rounded-2xl"
                    />
                  </div>
                ))}
            </div>
          </AdminSection>
        ))}
      </div>
    </div>
  );
}
