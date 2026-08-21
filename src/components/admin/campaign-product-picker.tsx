import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { listProducts } from "@/services/admin/products";

type ProductOption = { id: string; name: string; category: string };

export function CampaignProductPicker({
  productId,
  productName,
  onChange,
  disabled,
  allowAllProducts,
}: {
  productId?: string;
  productName?: string;
  onChange: (next: { productId?: string; product: string }) => void;
  disabled?: boolean;
  allowAllProducts?: boolean;
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

  const label = useMemo(() => {
    if (productId) {
      return products.find((p) => p.id === productId)?.name ?? productName ?? productId;
    }
    return productName?.trim() || "Select product…";
  }, [productId, productName, products]);

  return (
    <div>
      <Label>Product</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="mt-1 w-full justify-between rounded-2xl font-normal"
          >
            <span className="truncate">{label}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search products…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>{loading ? "Loading…" : "No products found."}</CommandEmpty>
              <CommandGroup>
                {allowAllProducts && (
                  <CommandItem
                    value="all-products"
                    onSelect={() => {
                      onChange({ productId: undefined, product: "All products" });
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn("mr-2 h-4 w-4", !productId ? "opacity-100" : "opacity-0")}
                    />
                    All products
                  </CommandItem>
                )}
                {products.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.id}
                    onSelect={() => {
                      onChange({ productId: p.id, product: p.name });
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        productId === p.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{p.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{p.category}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
