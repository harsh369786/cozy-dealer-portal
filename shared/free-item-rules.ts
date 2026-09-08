/**
 * Admin-configurable, dimension-based FREE-ITEM rule engine.
 *
 * Free items are stored (unchanged storage location) as a JSON array in the existing
 * `product_prices.free_items_label` TEXT column and snapshotted onto `order_items.free_items`.
 * Historically each row was just `{ label, quantity }` and was ALWAYS given. This module extends a
 * row with an OPTIONAL width rule so an admin can make a free item conditional on the ordered
 * mattress WIDTH (the breadth dimension) without any code change:
 *
 *   { label: "Fiber Pillow", quantity: 1, widthCondition: "WIDTH_LESS_THAN",    widthThreshold: 60 }
 *   { label: "Fiber Pillow", quantity: 2, widthCondition: "WIDTH_GREATER_EQUAL", widthThreshold: 60 }
 *   { label: "Wedge Pillow", quantity: 1, widthCondition: "WIDTH_GREATER_EQUAL", widthThreshold: 60 }
 *
 * Boundary semantics are exactly: `< threshold` is the FIRST category and `>= threshold` is the
 * SECOND category. So a width of exactly 60 falls into WIDTH_GREATER_EQUAL, never WIDTH_LESS_THAN.
 *
 * Backward compatibility: a row with NO widthCondition (or an unrecognised one) ALWAYS applies —
 * identical to the pre-existing behavior — and legacy plain-string labels are preserved untouched.
 *
 * The threshold is per-row and configurable (default 60"), so future rules like "< 72" / >= 72""
 * need no code change. Length is intentionally ignored: only width participates.
 */

export const FREE_ITEM_WIDTH_LESS_THAN = "WIDTH_LESS_THAN";
export const FREE_ITEM_WIDTH_GREATER_EQUAL = "WIDTH_GREATER_EQUAL";

export type FreeItemWidthCondition =
  | typeof FREE_ITEM_WIDTH_LESS_THAN
  | typeof FREE_ITEM_WIDTH_GREATER_EQUAL;

/** Default width threshold (inches) used when a rule doesn't specify one. Configurable per row. */
export const DEFAULT_FREE_ITEM_WIDTH_THRESHOLD = 60;

/** A single configured free item, optionally gated by a width condition. */
export type FreeItemRule = {
  label: string;
  quantity: number;
  /** Omitted / null => the item is ALWAYS given (legacy behavior). */
  widthCondition?: FreeItemWidthCondition | null;
  /** Width boundary in inches. Only meaningful when widthCondition is set. Defaults to 60. */
  widthThreshold?: number | null;
};

/** A resolved free item ready for display / snapshot (no rule metadata). */
export type ResolvedFreeItem = {
  label: string;
  quantity: number;
};

function coerceQuantity(value: unknown): number {
  const n = Math.floor(Number(value) || 0);
  return n > 0 ? n : 1;
}

function coerceCondition(value: unknown): FreeItemWidthCondition | null {
  if (value === FREE_ITEM_WIDTH_LESS_THAN || value === FREE_ITEM_WIDTH_GREATER_EQUAL) {
    return value;
  }
  return null;
}

function coerceThreshold(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_FREE_ITEM_WIDTH_THRESHOLD;
}

/**
 * Parse the stored free-items value (JSON array of rows, a JSON array of plain strings, or a legacy
 * plain display string) into normalized FreeItemRule[]. Never throws: unparseable/legacy strings
 * yield a single always-apply row so nothing is lost.
 */
export function parseFreeItemRules(value: unknown): FreeItemRule[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      const rows: FreeItemRule[] = [];
      for (const item of parsed) {
        if (typeof item === "string") {
          const label = item.trim();
          if (label) rows.push({ label, quantity: 1, widthCondition: null });
          continue;
        }
        if (item && typeof item === "object") {
          const row = item as Record<string, unknown>;
          const label = String(row.label ?? "").trim();
          if (!label) continue;
          const condition = coerceCondition(row.widthCondition);
          rows.push({
            label,
            quantity: coerceQuantity(row.quantity),
            widthCondition: condition,
            // Only keep a threshold when a condition is present, so "always" rows stay clean.
            widthThreshold: condition ? coerceThreshold(row.widthThreshold) : null,
          });
        }
      }
      return rows;
    }
  } catch {
    // Not JSON: treat the whole value as a single legacy label that always applies.
  }
  return [{ label: raw, quantity: 1, widthCondition: null }];
}

/**
 * Decide whether a single rule applies for the given ordered width (inches).
 * - No condition => always applies (legacy behavior).
 * - WIDTH_LESS_THAN     => width < threshold
 * - WIDTH_GREATER_EQUAL => width >= threshold   (a width EQUAL to the threshold matches here)
 * When a width-gated rule is evaluated but no width is known, it does NOT apply.
 */
export function ruleAppliesForWidth(rule: FreeItemRule, widthIn?: number | null): boolean {
  const condition = coerceCondition(rule.widthCondition ?? null);
  if (!condition) return true;
  if (widthIn == null || !Number.isFinite(widthIn)) return false;
  const threshold = coerceThreshold(rule.widthThreshold);
  if (condition === FREE_ITEM_WIDTH_LESS_THAN) return widthIn < threshold;
  return widthIn >= threshold;
}

/**
 * Evaluate all configured rules against the ordered width and return the free items to give.
 * Multiple rows may match the same condition (e.g. 2 Fiber Pillows + 1 Wedge Pillow for >= 60).
 */
export function evaluateFreeItems(
  rules: FreeItemRule[],
  widthIn?: number | null,
): ResolvedFreeItem[] {
  return rules
    .filter((rule) => ruleAppliesForWidth(rule, widthIn))
    .map((rule) => ({ label: rule.label, quantity: coerceQuantity(rule.quantity) }));
}

/** Serialize resolved free items back into the JSON convention used by the stored column. */
export function serializeResolvedFreeItems(items: ResolvedFreeItem[]): string | null {
  const cleaned = items
    .map((item) => ({ label: String(item.label ?? "").trim(), quantity: coerceQuantity(item.quantity) }))
    .filter((item) => item.label);
  return cleaned.length ? JSON.stringify(cleaned) : null;
}

/**
 * Convenience: from the stored free-items value + an ordered width, produce the filtered stored
 * value (JSON) to snapshot onto the quote/order. Returns null when nothing qualifies.
 *
 * If width is unknown (undefined), the FULL configured list is returned unchanged (catalog "from"
 * preview and non-mattress items keep showing every configured free item).
 */
export function resolveFreeItemsForWidth(
  storedValue: unknown,
  widthIn?: number | null,
): string | null {
  const rules = parseFreeItemRules(storedValue);
  if (rules.length === 0) return null;

  // No width context (e.g. catalog preview): keep the configured list as-is (labels + quantities),
  // so a browsing dealer still sees "what comes free with this product".
  if (widthIn == null || !Number.isFinite(widthIn)) {
    return serializeResolvedFreeItems(
      rules.map((rule) => ({ label: rule.label, quantity: coerceQuantity(rule.quantity) })),
    );
  }

  return serializeResolvedFreeItems(evaluateFreeItems(rules, widthIn));
}
