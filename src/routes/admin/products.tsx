import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";

export const Route = createFileRoute("/admin/products")({
  component: AdminProducts,
});

function AdminProducts() {
  const [products, setProducts] = useState<Array<Record<string, string>>>([]);

  useEffect(() => {
    api.get<Array<Record<string, string>>>("/api/v1/admin/products").then(setProducts).catch(() => setProducts([]));
  }, []);

  return (
    <ul className="space-y-2">
      {products.map((p) => (
        <li key={p.id} className="rounded-2xl border border-border bg-card px-4 py-3">
          <p className="font-bold">{p.name}</p>
          <p className="text-xs text-muted-foreground">
            {p.category} · {p.guarantee}
          </p>
        </li>
      ))}
    </ul>
  );
}
