import { useTranslation } from "react-i18next";

export type OrderNotesItem = {
  model?: string;
  sizeRequested?: string | null;
  sizeStandard?: string | null;
  size?: string;
  thickness?: string;
  notes?: string | null;
  farma?: boolean;
  farmaDetails?: string | null;
  farmaCorners?: string[] | null;
};

export type OrderNotesPanelProps = {
  orderNotes?: string | null;
  items: OrderNotesItem[];
  className?: string;
};

function parseSizePair(value?: string | null) {
  if (!value) return null;
  const match = value.match(/([\d.]+)"\s*×\s*([\d.]+)"/);
  if (!match) return null;
  return { length: match[1], breadth: match[2] };
}

function formatSizeLine(item: OrderNotesItem, t: (key: string) => string) {
  const requestedRaw = item.sizeRequested ?? item.size;
  const standardRaw = item.sizeStandard;
  const requested = parseSizePair(requestedRaw);
  const standard = parseSizePair(standardRaw);
  const thickness = item.thickness && item.thickness !== "—" ? item.thickness : null;

  if (requestedRaw && standardRaw && requestedRaw !== standardRaw) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("common.requested")}: {requestedRaw}
        {thickness ? ` × ${thickness}` : ""}
        <br />
        {t("common.pricedAs")}: {standardRaw}
        {thickness ? ` × ${thickness}` : ""}
      </p>
    );
  }

  const sizeLabel = requestedRaw ?? standardRaw ?? "—";
  return (
    <p className="text-sm text-muted-foreground">
      {sizeLabel}
      {thickness ? ` × ${thickness}` : ""}
    </p>
  );
}

export function OrderNotesPanel({ orderNotes, items, className }: OrderNotesPanelProps) {
  const { t } = useTranslation();

  const itemNotes = items.filter(
    (item) =>
      item.notes ||
      item.farma ||
      item.farmaDetails ||
      (item.farmaCorners && item.farmaCorners.length > 0) ||
      (item.sizeRequested && item.sizeStandard && item.sizeRequested !== item.sizeStandard),
  );

  if (!orderNotes?.trim() && itemNotes.length === 0) return null;

  return (
    <div className={className ?? "rounded-2xl border border-border bg-secondary/20 p-4 space-y-3"}>
      <p className="text-sm font-bold">{t("common.orderNotes")}</p>
      {orderNotes?.trim() && (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{orderNotes.trim()}</p>
      )}
      {itemNotes.map((item, index) => (
        <div key={index} className="space-y-1 border-t border-border/60 pt-2 first:border-t-0 first:pt-0">
          {item.model && <p className="text-sm font-semibold">{item.model}</p>}
          {formatSizeLine(item, t)}
          {item.farma && (
            <p className="text-sm text-muted-foreground">
              {t("common.farma")}: {item.farmaDetails?.trim() || t("common.yes")}
            </p>
          )}
          {item.farmaCorners && item.farmaCorners.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {t("common.farmaCorners")}: {item.farmaCorners.join(", ")}
            </p>
          )}
          {item.notes?.trim() && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.notes.trim()}</p>
          )}
        </div>
      ))}
    </div>
  );
}
