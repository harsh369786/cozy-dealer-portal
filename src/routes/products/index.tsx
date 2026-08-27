import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SearchBar, matchesSearch } from "@/components/shared/search-bar";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { cn } from "@/lib/utils";
import { requireRoles } from "@/lib/auth-guard";
import { useAsyncData } from "@/hooks/use-async-data";
import { useFormat } from "@/hooks/use-format";
import { getCatalog, type CatalogProduct, type CatalogResponse } from "@/services/catalog";
import i18n from "@/lib/i18n";

export const Route = createFileRoute("/products/")({
  beforeLoad: () => requireRoles(["dealer"]),
  head: () => ({
    meta: [
      { title: i18n.t("dealer.meta.productsTitle") },
      {
        name: "description",
        content: i18n.t("dealer.meta.productsDescription"),
      },
      { property: "og:title", content: i18n.t("dealer.meta.productsTitle") },
      {
        property: "og:description",
        content: i18n.t("dealer.meta.productsDescription"),
      },
    ],
  }),
  component: Catalogue,
});

const tabs = ["Mattresses", "Foldable", "Pillows"] as const;

const TAB_KEYS: Record<(typeof tabs)[number], string> = {
  Mattresses: "common.mattresses",
  Foldable: "common.foldableMattresses",
  Pillows: "common.pillows",
};

type ListProduct = {
  id: string;
  name: string;
  category?: string;
  guarantee?: string;
  price?: number;
  campaignPrice?: number | null;
  unitPrice?: number;
};

function mapCatalogProduct(p: CatalogProduct): ListProduct {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    guarantee: p.guarantee,
    price: p.price,
    campaignPrice: p.campaignPrice,
    unitPrice: p.unitPrice,
  };
}

function Catalogue() {
  const { t } = useTranslation();
  const catalogQuery = useAsyncData(() => getCatalog(), []);
  const [tab, setTab] = useState<(typeof tabs)[number]>("Mattresses");
  const [search, setSearch] = useState("");

  const catalog = catalogQuery.data;
  const loading = catalogQuery.loading;
  const error = catalogQuery.error;

  const productMap = useMemo(() => {
    const map = new Map<string, ListProduct>();
    for (const p of catalog?.products ?? []) {
      map.set(p.id, mapCatalogProduct(p));
    }
    return map;
  }, [catalog?.products]);

  const mattressLayers = catalog?.mattressLayers ?? [];
  const foldableItems = (catalog?.foldable ?? []).map(mapCatalogProduct);
  const pillowItems = (catalog?.pillows ?? []).map(mapCatalogProduct);

  const filterProducts = (items: ListProduct[]) =>
    items.filter((p) => matchesSearch(search, p.name, p.category, p.guarantee));

  const pageTitle = t("dealer.products.chooseModel");

  if (loading) {
    return (
      <AppShell title={pageTitle}>
        <PageSkeleton rows={4} />
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell title={pageTitle}>
        <ErrorState message={error} onRetry={catalogQuery.retry} />
      </AppShell>
    );
  }

  return (
    <AppShell title={pageTitle}>
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder={t("common.searchProducts")}
      />

      <p className="mt-4 text-sm text-muted-foreground">{t("common.tapModelToOrder")}</p>

      <div className="mt-4 flex gap-2 rounded-2xl bg-secondary/80 p-1">
        {tabs.map((c) => (
          <button
            key={c}
            onClick={() => setTab(c)}
            className={cn(
              "press flex-1 rounded-xl py-2.5 text-sm font-bold transition-colors",
              tab === c
                ? "border border-foreground/20 bg-card text-foreground shadow-soft"
                : "border border-transparent text-muted-foreground",
            )}
          >
            {t(TAB_KEYS[c])}
          </button>
        ))}
      </div>

      {tab === "Mattresses" && (
        <div className="mt-5 space-y-4">
          {mattressLayers.map((layer, layerIdx) => (
            <MattressLayerSection
              key={layer.id}
              layer={layer}
              layerIdx={layerIdx}
              productMap={productMap}
              filterProducts={filterProducts}
            />
          ))}
        </div>
      )}

      {tab === "Foldable" && (
        <section className="animate-rise mt-5 overflow-hidden rounded-3xl border border-border bg-secondary/40 p-4">
          <h2 className="flex items-center gap-2 font-display text-base font-bold">
            <ShieldCheck className="h-5 w-5 text-primary" strokeWidth={2.25} />
            {t("common.foldableMattresses")}
          </h2>
          <div className="mt-4">
            <ProductList products={filterProducts(foldableItems)} />
          </div>
        </section>
      )}

      {tab === "Pillows" && (
        <section className="animate-rise mt-5 overflow-hidden rounded-3xl border border-border bg-secondary/40 p-4">
          <h2 className="flex items-center gap-2 font-display text-base font-bold">
            <ShieldCheck className="h-5 w-5 text-primary" strokeWidth={2.25} />
            {t("common.pillows")}
          </h2>
          <div className="mt-4">
            <ProductList products={filterProducts(pillowItems)} />
          </div>
        </section>
      )}
    </AppShell>
  );
}

function MattressLayerSection({
  layer,
  layerIdx,
  productMap,
  filterProducts,
}: {
  layer: CatalogResponse["mattressLayers"][number];
  layerIdx: number;
  productMap: Map<string, ListProduct>;
  filterProducts: (items: ListProduct[]) => ListProduct[];
}) {
  const resolveProducts = (ids: string[]): ListProduct[] =>
    ids.map((id) => productMap.get(id)).filter((p): p is ListProduct => Boolean(p));

  return (
    <section
      className="animate-rise overflow-hidden rounded-3xl border border-border bg-secondary/40 p-4"
      style={{ animationDelay: `${layerIdx * 60}ms` }}
    >
      <h2 className="flex items-center gap-2 font-display text-base font-bold text-foreground">
        <ShieldCheck className="h-5 w-5 text-primary" strokeWidth={2.25} />
        {layer.title}
      </h2>

      {"subgroups" in layer && layer.subgroups ? (
        <div className="mt-4 space-y-4">
          {layer.subgroups.map((sg) => {
            const filteredItems = filterProducts(resolveProducts(sg.productIds));
            if (!filteredItems.length) return null;
            return (
              <div key={sg.label}>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {sg.label}
                </p>
                <ProductList products={filteredItems} />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-4">
          <ProductList
            products={filterProducts(resolveProducts(layer.productIds ?? []))}
          />
        </div>
      )}
    </section>
  );
}

function ProductList({ products: items }: { products: ListProduct[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-soft">
      {items.map((p, i) => (
        <div key={p.id} className={cn(i > 0 && "border-t border-border/70")}>
          <ProductRow product={p} />
        </div>
      ))}
    </div>
  );
}

function ProductRow({ product: p }: { product: ListProduct }) {
  const { t } = useTranslation();
  const { formatCurrency } = useFormat();
  const hasCampaign = p.campaignPrice != null && p.price != null && p.campaignPrice < p.price;

  return (
    <Link
      to="/products/$productId"
      params={{ productId: p.id }}
      className="press flex min-w-0 items-center justify-between gap-3 px-4 py-3.5"
    >
      <div className="min-w-0 flex-1">
        <p className="font-display text-[15px] font-bold leading-snug text-foreground">{p.name}</p>
        {hasCampaign && (
          <p className="mt-0.5 text-xs font-semibold">
            <span className="text-muted-foreground line-through">{formatCurrency(p.price!)}</span>
            <span className="ml-2 text-primary">{formatCurrency(p.campaignPrice!)}</span>
          </p>
        )}
      </div>
      <span className="flex shrink-0 items-center gap-0.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground">
        {t("common.select")}
        <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
      </span>
    </Link>
  );
}
