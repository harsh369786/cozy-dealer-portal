import { useEffect, useState } from "react";
import { ChevronsUpDown, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { listProducts } from "@/services/admin/products";

type ProductOption = { id: string; name: string; category: string };
export type SelectedProduct = { id: string; name: string };

/**
 * Multi-product selector for campaigns. Admin searches the existing Product Catalogue and adds one
 * or more products; each selected product shows as a removable chip. An empty selection means the
 * campaign targets ALL products (the legacy behavior). Products are referenced by their existing
 * IDs — no product records are created or modified here.
 */
export function CampaignMultiProductPicker({
  selected,
  onChange,
  disabled,
}: {
  selected: SelectedProduct[];
  onChange: (next: SelectedProduct[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listProducts({ status: "active", search: search || undefined, pageSize: 100 })
      .then((result) => {
        if (!cancelled) {
          setProducts(result.items.map((p) => ({ id: p.id, name: p.name, category: p.category })));
        }
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [search]);

  const selectedIds = new Set(selected.map((p) => p.id));

  const add = (p: ProductOption) => {
    if (selectedIds.has(p.id)) return;
    onChange([...selected, { id: p.id, name: p.name }]);
  };
  const remove = (id: string) => onChange(selected.filter((p) => p.id !== id));

  return (
    <div>
      <Label>Products</Label>

      {/* Selected products (chips). Empty => all products. */}
      <div className="mt-1 flex flex-wrap gap-2">
        {selected.length === 0 ? (
          <span className="text-sm text-muted-foreground">All products</span>
        ) : (
          selected.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm font-medium"
            >
              <span className="max-w-[180px] truncate">{p.name}</span>
              {!disabled ? (
                <button
                  type="button"
                  aria-label={`Remove ${p.name}`}
                  className="rounded-full p-0.5 hover:bg-background"
                  onClick={() => remove(p.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </span>
          ))
        )}
      </div>

      {!disabled ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="mt-2 w-full justify-between rounded-2xl font-normal"
            >
              <span className="inline-flex items-center gap-1">
                <Plus className="h-4 w-4" />
                Add product
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput placeholder="Search products…" value={search} onValueChange={setSearch} />
              <CommandList>
                <CommandEmpty>{loading ? "Loading…" : "No products found."}</CommandEmpty>
                <CommandGroup>
                  {products.map((p) => {
                    const isSelected = selectedIds.has(p.id);
                    return (
                      <CommandItem
                        key={p.id}
                        value={p.id}
                        disabled={isSelected}
                        onSelect={() => add(p)}
                      >
                        <span className="truncate">{p.name}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {isSelected ? "Added" : p.category}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      ) : null}
      <p className="mt-1 text-xs text-muted-foreground">
        Leave empty to apply this campaign to all products.
      </p>
    </div>
  );
}
