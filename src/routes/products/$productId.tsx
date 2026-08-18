import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  Gift,
  Info,
  Minus,
  Plus,
  ShieldCheck,
  X,
  MessageCircle,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CampaignBadge, CampaignPriceBlock } from "@/components/campaign-price";
import { cn } from "@/lib/utils";
import { Confetti, ProgressBar } from "@/components/brand";
import {
  getActivePriceCampaign,
  getCampaignPrice,
  getCampaignSavings,
  formatCampaignDate,
} from "@/lib/campaign-service";
import {
  BREADTHS,
  FREE_ITEM,
  LENGTHS,
  dealer,
  getProduct,
  inr,
  salespeople,
} from "@/lib/demo-data";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/products/$productId")({
  head: () => ({
    meta: [
      { title: "Build Your Order — BackRest Dealer App" },
      {
        name: "description",
        content:
          "Enter size, thickness, farma and quantity, then place your BackRest order in one tap.",
      },
      { property: "og:title", content: "Build Your Order — BackRest Dealer App" },
      {
        property: "og:description",
        content: "Fast dealer ordering: size, thickness, farma, quantity, done.",
      },
    ],
  }),
  component: Configurator,
});

type Farma = { tl: string; tr: string; bl: string; br: string };

function whatsappUrl(phone: string, message: string) {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function Configurator() {
  const { productId } = useParams({ from: "/products/$productId" });
  const product = getProduct(productId);
  const isPillow = product.category === "Pillows";

  const [length, setLength] = useState<number>(LENGTHS[2]!);
  const [breadth, setBreadth] = useState<number>(BREADTHS[3]!);
  const [thickness, setThickness] = useState(product.thicknesses[0] ?? "");
  const [farma, setFarma] = useState(false);
  const [f, setF] = useState<Farma>({ tl: "", tr: "", bl: "", br: "" });
  const [qty, setQty] = useState(1);
  const [placedBy, setPlacedBy] = useState<string>(salespeople[0]);
  const [notes, setNotes] = useState("");
  const [customer, setCustomer] = useState({ name: "", address: "", mobile: "", email: "" });
  const [showCustomer, setShowCustomer] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [placed, setPlaced] = useState<string | null>(null);

  const campaign = getActivePriceCampaign(product.id);
  const unitDealerPrice = product.price;
  const unitCampaignPrice = campaign
    ? getCampaignPrice(unitDealerPrice, campaign.discountPercent)
    : null;
  const unitPrice = unitCampaignPrice ?? unitDealerPrice;
  const unitSavings = campaign ? getCampaignSavings(unitDealerPrice, unitCampaignPrice!) : 0;

  const total = unitPrice * qty;
  const mrpTotal = product.mrp * qty;
  const dealerTotal = unitDealerPrice * qty;
  const savingsTotal = unitSavings * qty;
  const points = product.points * qty;
  const newPoints = dealer.points + points;
  const remaining = Math.max(0, dealer.nextRewardAt - newPoints);
  const pct = Math.min(100, (newPoints / dealer.nextRewardAt) * 100);

  const waMessage = useMemo(() => {
    const lines = [
      `BackRest Order ${placed ?? ""}`,
      `Status: Order Placed`,
      `Model: ${product.name} (${product.guarantee})`,
      isPillow ? `Size: ${product.fixedSize}` : `Size: ${length} × ${breadth} × ${thickness}`,
      !isPillow ? `Farma: ${farma ? "Yes" : "No"}` : "",
      farma
        ? `Farma: TL ${f.tl || "-"}, TR ${f.tr || "-"}, BL ${f.bl || "-"}, BR ${f.br || "-"}`
        : "",
      `Quantity: ${qty}`,
      `MRP: ${inr(mrpTotal)}`,
      `Dealer Price: ${inr(dealerTotal)}`,
      campaign ? `Campaign Price: ${inr(total)}` : "",
      campaign ? `You saved: ${inr(savingsTotal)}` : "",
      product.free ? `Free: ${qty * 2} × Fiber Pillows` : "",
      `Reward Points Earned: ${points}`,
      `Order Placed By: ${placedBy}`,
      customer.name ? `Customer: ${customer.name}` : "",
      customer.mobile ? `Mobile: ${customer.mobile}` : "",
      customer.address ? `Address: ${customer.address}` : "",
      notes ? `Special Requirements: ${notes}` : "",
    ].filter(Boolean);
    return lines.join("\n");
  }, [
    placed,
    product,
    isPillow,
    length,
    breadth,
    thickness,
    farma,
    f,
    qty,
    mrpTotal,
    dealerTotal,
    total,
    savingsTotal,
    campaign,
    points,
    placedBy,
    customer,
    notes,
  ]);

  useEffect(() => {
    if (!placed) return;
    window.open(whatsappUrl(dealer.phone, waMessage), "_blank", "noopener,noreferrer");
  }, [placed, waMessage]);

  return (
    <AppShell title={product.name} back="/products">
      {campaign && <CampaignBadge label={campaign.badgeLabel ?? "Special Offer"} />}

      {!isPillow && (
        <p className="animate-rise flex gap-2 rounded-2xl border border-primary/30 bg-secondary p-4 text-sm font-bold">
          <Info className="h-5 w-5 shrink-0 text-primary" />
          All sizes should be entered as the exact size required, as per the bed size.
        </p>
      )}

      <div className="mt-4 flex gap-3 rounded-3xl border border-border bg-card p-3 shadow-soft">
        <img
          src={product.image}
          alt={product.name}
          width={400}
          height={400}
          className="h-20 w-20 rounded-2xl object-cover"
        />
        <div className="flex-1">
          <p className="font-display text-lg font-bold">{product.name}</p>
          <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            {product.guarantee === "Pillow" ? "Pillow" : `${product.guarantee} Guarantee`}
          </p>
          <p className="mt-1 text-sm text-muted-foreground line-through">MRP {inr(product.mrp)}</p>
          {campaign ? (
            <>
              <p className="text-sm text-muted-foreground line-through">
                Dealer {inr(product.price)}
              </p>
              <p className="font-display text-xl font-bold text-primary">
                {inr(unitCampaignPrice!)}
              </p>
            </>
          ) : (
            <p className="font-display text-xl font-bold text-primary">{inr(product.price)}</p>
          )}
          {campaign && (
            <p className="mt-1 text-xs font-semibold text-primary">
              Valid until {formatCampaignDate(campaign.endAt)}
            </p>
          )}
        </div>
      </div>

      {isPillow ? (
        <div className="mt-5 rounded-3xl border border-border bg-card p-4">
          <p className="text-base font-bold">Size</p>
          <p className="mt-1 font-display text-2xl font-bold">{product.fixedSize}</p>
        </div>
      ) : (
        <>
          <div className="mt-5">
            <p className="text-base font-bold">Length (inches)</p>
            <ChipRow options={LENGTHS} value={length} onChange={setLength} min={30} max={120} />
          </div>

          <div className="mt-5">
            <p className="text-base font-bold">Breadth (inches)</p>
            <ChipRow options={BREADTHS} value={breadth} onChange={setBreadth} min={20} max={120} />
          </div>

          <div className="mt-5">
            <p className="text-base font-bold">Thickness</p>
            <div className="mt-3 flex gap-3">
              {product.thicknesses.map((t) => (
                <button
                  key={t}
                  onClick={() => setThickness(t)}
                  className={cn(
                    "press flex-1 rounded-2xl border py-4 text-base font-bold",
                    thickness === t
                      ? "border-transparent brand-gradient text-primary-foreground"
                      : "border-border bg-card",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <p className="text-base font-bold">Farma</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  onClick={() => setFarma(v)}
                  className={cn(
                    "press rounded-2xl border py-4 text-base font-bold",
                    farma === v
                      ? "border-transparent brand-gradient text-primary-foreground"
                      : "border-border bg-card",
                  )}
                >
                  {v ? "Yes" : "No"}
                </button>
              ))}
            </div>
          </div>

          {farma && (
            <div className="animate-rise mt-4 rounded-3xl border border-border bg-card p-4">
              <p className="text-sm font-bold">Farma sizes (inches)</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <FarmaField label="Top Left" value={f.tl} onChange={(v) => setF({ ...f, tl: v })} />
                <FarmaField
                  label="Top Right"
                  value={f.tr}
                  onChange={(v) => setF({ ...f, tr: v })}
                />
                <FarmaField
                  label="Bottom Left"
                  value={f.bl}
                  onChange={(v) => setF({ ...f, bl: v })}
                />
                <FarmaField
                  label="Bottom Right"
                  value={f.br}
                  onChange={(v) => setF({ ...f, br: v })}
                />
              </div>
            </div>
          )}
        </>
      )}

      <div className="mt-5">
        <p className="text-base font-bold">Quantity</p>
        <div className="mt-3 flex items-center justify-between rounded-2xl border border-border bg-card p-2">
          <button
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            aria-label="Reduce quantity"
            className="press grid h-14 w-14 place-items-center rounded-xl bg-secondary"
          >
            <Minus className="h-6 w-6" />
          </button>
          <span className="font-display text-3xl font-bold">{qty}</span>
          <button
            onClick={() => setQty((q) => q + 1)}
            aria-label="Increase quantity"
            className="press grid h-14 w-14 place-items-center rounded-xl bg-secondary"
          >
            <Plus className="h-6 w-6" />
          </button>
        </div>
      </div>

      {product.free && (
        <div className="mt-5 rounded-3xl border-2 border-primary/40 bg-secondary p-4">
          <p className="font-display text-base font-bold">🎁 Free With This Mattress</p>
          <div className="mt-3 flex items-center gap-3">
            <span className="rounded-lg brand-gradient px-2.5 py-1 text-xs font-bold text-primary-foreground">
              FREE
            </span>
            <div>
              <p className="text-base font-bold">{qty * 2} × Fiber Pillows</p>
              <p className="text-xs text-muted-foreground">
                Included with this mattress · worth {inr(FREE_ITEM.value * qty)}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 rounded-3xl border border-border surface-gradient p-5">
        <CampaignPriceBlock
          mrp={product.mrp}
          dealerPrice={product.price}
          campaignPrice={unitCampaignPrice ?? undefined}
          qty={qty}
        />
        <p className="mt-3 rounded-2xl bg-card/70 px-4 py-3 text-sm font-bold">
          You'll earn {points} reward points 🎁
        </p>
      </div>

      <div className="mt-5">
        <p className="text-base font-bold">Order Placed By</p>
        <Select value={placedBy} onValueChange={setPlacedBy}>
          <SelectTrigger className="mt-3 h-14 rounded-2xl text-base font-semibold">
            <SelectValue placeholder="Select Salesperson" />
          </SelectTrigger>
          <SelectContent>
            {salespeople.map((name) => (
              <SelectItem key={name} value={name} className="text-base">
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-5 rounded-3xl border border-border bg-card">
        <button
          onClick={() => setShowCustomer((s) => !s)}
          className="press flex w-full items-center justify-between px-4 py-4"
        >
          <span className="text-base font-bold">
            Customer Details{" "}
            <span className="text-xs font-semibold text-muted-foreground">Optional</span>
          </span>
          <ChevronDown
            className={cn("h-5 w-5 transition-transform", showCustomer && "rotate-180")}
          />
        </button>
        {showCustomer && (
          <div className="animate-rise space-y-3 px-4 pb-4">
            <Field
              label="Customer Name"
              value={customer.name}
              onChange={(v) => setCustomer({ ...customer, name: v })}
            />
            <Field
              label="Address"
              value={customer.address}
              onChange={(v) => setCustomer({ ...customer, address: v })}
            />
            <Field
              label="Mobile"
              value={customer.mobile}
              onChange={(v) => setCustomer({ ...customer, mobile: v })}
              inputMode="numeric"
            />
            <Field
              label="Email"
              value={customer.email}
              onChange={(v) => setCustomer({ ...customer, email: v })}
            />
          </div>
        )}
      </div>

      <div className="mt-5">
        <p className="text-base font-bold">
          Special Requirements / Notes{" "}
          <span className="text-xs font-semibold text-muted-foreground">Optional</span>
        </p>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add any special requirements for this order…"
          className="mt-3 min-h-28 rounded-2xl border-input text-base"
        />
      </div>

      <button
        onClick={() => setConfirm(true)}
        className="press mt-6 h-16 w-full rounded-2xl brand-gradient text-lg font-bold text-primary-foreground"
      >
        Review Order
      </button>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/50 p-0 backdrop-blur-sm">
          <div className="animate-rise max-h-[88vh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl border border-border bg-card p-5 md:max-w-[520px]">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-bold">Confirm Your Order</h3>
              <button
                onClick={() => setConfirm(false)}
                aria-label="Close"
                className="press grid h-10 w-10 place-items-center rounded-full bg-secondary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 divide-y divide-border rounded-2xl border border-border">
              <Line label="Model" value={product.name} />
              <Line
                label="Guarantee"
                value={product.guarantee === "Pillow" ? "Pillow" : product.guarantee}
              />
              {isPillow ? (
                <Line label="Size" value={product.fixedSize!} />
              ) : (
                <>
                  <Line label="Length" value={`${length}"`} />
                  <Line label="Breadth" value={`${breadth}"`} />
                  <Line label="Thickness" value={thickness} />
                  <Line label="Farma" value={farma ? "Yes" : "No"} />
                  {farma && (
                    <Line
                      label="Farma sizes"
                      value={`TL ${f.tl || "-"} · TR ${f.tr || "-"} · BL ${f.bl || "-"} · BR ${f.br || "-"}`}
                    />
                  )}
                </>
              )}
              <Line label="Quantity" value={String(qty)} />
              <Line label="MRP" value={inr(mrpTotal)} muted />
              <Line
                label="Dealer Price"
                value={inr(dealerTotal)}
                muted={!!campaign}
                strong={!campaign}
              />
              {campaign && (
                <>
                  <Line label="Campaign Price" value={inr(total)} strong />
                  <Line label="You save" value={inr(savingsTotal)} strong />
                </>
              )}
              {product.free && <Line label="Free items" value={`${qty * 2} × Fiber Pillows`} />}
              <Line label="Reward points" value={`+${points}`} strong />
              <Line
                label="Points remaining"
                value={String(Math.max(0, dealer.nextRewardAt - newPoints))}
              />
              <Line label="Order Placed By" value={placedBy} />
              {notes && <Line label="Special Requirements" value={notes} />}
              {customer.name && <Line label="Customer" value={customer.name} />}
              {customer.mobile && <Line label="Mobile" value={customer.mobile} />}
              {customer.address && <Line label="Address" value={customer.address} />}
              {customer.email && <Line label="Email" value={customer.email} />}
              <Line label="Delivery" value="Free · 5–7 days" />
            </div>

            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <MessageCircle className="h-4 w-4" /> Order details will be sent to your WhatsApp.
            </p>

            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setConfirm(false)}
                className="press h-14 flex-1 rounded-2xl border border-border bg-background text-base font-bold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirm(false);
                  setPlaced("BR-" + Math.floor(100000 + Math.random() * 899999));
                }}
                className="press h-14 flex-[1.4] rounded-2xl brand-gradient text-base font-bold text-primary-foreground"
              >
                Place Order
              </button>
            </div>
          </div>
        </div>
      )}

      {placed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-5 backdrop-blur-sm">
          <div className="animate-pop relative w-full max-w-[430px] overflow-hidden rounded-3xl border border-border bg-card p-6 text-center shadow-lift md:max-w-[520px]">
            <Confetti />
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full brand-gradient">
              <Check className="h-10 w-10 text-primary-foreground" strokeWidth={3} />
            </div>
            <h2 className="animate-rise mt-5 font-display text-2xl font-bold">
              🎉 Order Placed Successfully!
            </h2>
            <p className="mt-3 font-display text-xl font-bold">Order Number: {placed}</p>
            <p className="mt-2 text-base font-bold text-primary">Reward Points Earned: {points}</p>

            {campaign && savingsTotal > 0 && (
              <div className="mt-4 rounded-2xl border border-primary/30 bg-secondary px-4 py-3">
                <p className="text-sm font-bold text-primary">Campaign Discount Applied</p>
                <p className="mt-1 font-display text-xl font-bold">You saved {inr(savingsTotal)}</p>
              </div>
            )}

            <div className="mt-5 rounded-2xl border border-border surface-gradient p-4 text-left">
              <ProgressBar value={pct} />
              <p className="mt-3 text-sm font-semibold">
                {remaining > 0
                  ? `Points remaining for your next reward: ${remaining}`
                  : "Reward unlocked! Claim it in Rewards 🎁"}
              </p>
            </div>

            <p className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-secondary px-4 py-3 text-sm font-bold text-success">
              <MessageCircle className="h-4 w-4" /> ✓ Order details sent on WhatsApp
            </p>
            <a
              href={whatsappUrl(dealer.phone, waMessage)}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block text-xs font-semibold text-muted-foreground underline underline-offset-4"
            >
              Open WhatsApp again
            </a>

            <Link
              to="/orders"
              className="press mt-5 block rounded-2xl brand-gradient px-8 py-4 text-lg font-bold text-primary-foreground"
            >
              View Order
            </Link>
            <Link to="/home" className="mt-3 block text-sm font-bold text-muted-foreground">
              Back to Home
            </Link>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function ChipRow({
  options,
  value,
  onChange,
  min,
  max,
}: {
  options: number[];
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) {
  const custom = !options.includes(value);
  return (
    <>
      <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={cn(
              "press h-14 w-14 shrink-0 rounded-2xl border text-base font-bold",
              value === o
                ? "border-transparent brand-gradient text-primary-foreground"
                : "border-border bg-card",
            )}
          >
            {o}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Other size</span>
        <input
          inputMode="numeric"
          value={custom ? value : ""}
          placeholder="—"
          onChange={(e) => {
            const n = Number(e.target.value.replace(/\D/g, ""));
            if (n >= min && n <= max) onChange(n);
          }}
          className="h-11 w-20 rounded-xl border border-input bg-card text-center text-base font-bold outline-none focus:border-ring"
        />
      </div>
    </>
  );
}

function FarmaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <input
        inputMode="numeric"
        value={value}
        placeholder='e.g. 6"'
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-14 w-full rounded-2xl border border-input bg-background px-3 text-base font-bold outline-none focus:border-ring"
      />
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: "numeric" | "text";
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-muted-foreground">{label} · Optional</span>
      <input
        value={value}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-14 w-full rounded-2xl border border-input bg-background px-4 text-base outline-none focus:border-ring"
      />
    </label>
  );
}

function Line({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-right font-semibold",
          strong && "font-display text-base font-bold text-primary",
          muted && "text-muted-foreground line-through",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export { Gift };
