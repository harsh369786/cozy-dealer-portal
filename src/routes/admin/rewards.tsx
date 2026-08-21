import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";

export const Route = createFileRoute("/admin/rewards")({
  component: AdminRewards,
});

function AdminRewards() {
  const [rewards, setRewards] = useState<Array<Record<string, string | number>>>([]);

  useEffect(() => {
    api.get<Array<Record<string, string | number>>>("/api/v1/admin/rewards").then(setRewards).catch(() => setRewards([]));
  }, []);

  return (
    <ul className="space-y-2">
      {rewards.map((r) => (
        <li key={String(r.id)} className="rounded-2xl border border-border bg-card px-4 py-3">
          <p className="font-bold">
            {r.emoji} {r.name}
          </p>
          <p className="text-xs text-muted-foreground">{r.points_required} points</p>
        </li>
      ))}
    </ul>
  );
}
