import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettings,
});

function AdminSettings() {
  const [settings, setSettings] = useState<Array<{ key: string; value: string }>>([]);

  useEffect(() => {
    api.get<Array<{ key: string; value: string }>>("/api/v1/admin/settings").then(setSettings).catch(() => setSettings([]));
  }, []);

  return (
    <ul className="space-y-2">
      {settings.map((s) => (
        <li key={s.key} className="flex justify-between rounded-2xl border border-border bg-card px-4 py-3">
          <span className="font-bold">{s.key}</span>
          <span className="text-muted-foreground">{s.value}</span>
        </li>
      ))}
    </ul>
  );
}
