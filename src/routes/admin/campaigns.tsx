import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";

export const Route = createFileRoute("/admin/campaigns")({
  component: AdminCampaigns,
});

function AdminCampaigns() {
  const [campaigns, setCampaigns] = useState<Array<Record<string, string>>>([]);

  useEffect(() => {
    api
      .get<Array<Record<string, string>>>("/api/v1/admin/campaigns/price")
      .then(setCampaigns)
      .catch(() => setCampaigns([]));
  }, []);

  return (
    <ul className="space-y-2">
      {campaigns.map((c) => (
        <li key={c.id} className="rounded-2xl border border-border bg-card px-4 py-3">
          <p className="font-bold">{c.name}</p>
          <p className="text-xs text-muted-foreground">
            {c.discount_percent}% off · {c.product_id}
          </p>
        </li>
      ))}
    </ul>
  );
}
