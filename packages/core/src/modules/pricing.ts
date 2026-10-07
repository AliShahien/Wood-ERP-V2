import { D, money, sum, ZERO, type Dec } from "../platform/money";

/**
 * Door pricing (see docs/BUSINESS_RULES.md §Pricing):
 *   base   = basePrice                 (PER_UNIT)
 *          = basePrice × area_m²       (PER_SQM)
 *   option = adj                       (FIXED_PER_UNIT)
 *          = adj × area_m²             (PER_SQM)
 *          = base × adj / 100          (PERCENT)
 *   unit price = base + Σ options.  A product-level price override replaces the option's adj.
 */
export interface PriceOption {
  priceMethod: "FIXED_PER_UNIT" | "PER_SQM" | "PERCENT";
  priceAdjustment: Dec | number | string;
}

export function doorArea(widthMm: Dec | number | string, heightMm: Dec | number | string): Dec {
  return D(widthMm).times(D(heightMm)).div(1_000_000);
}

export function unitPrice(input: {
  pricingMethod: "PER_UNIT" | "PER_SQM";
  basePrice: Dec | number | string;
  width: Dec | number | string;
  height: Dec | number | string;
  options: PriceOption[];
}): Dec {
  const area = doorArea(input.width, input.height);
  const base = input.pricingMethod === "PER_SQM" ? D(input.basePrice).times(area) : D(input.basePrice);
  const extras = input.options.map((o) => {
    const adj = D(o.priceAdjustment);
    if (o.priceMethod === "PER_SQM") return adj.times(area);
    if (o.priceMethod === "PERCENT") return base.times(adj).div(100);
    return adj;
  });
  return money(base.plus(sum(extras)));
}

export interface TotalsInput {
  lines: { quantity: Dec | number | string; unitPrice: Dec | number | string; discount?: Dec | number | string | null }[];
  discountType: "AMOUNT" | "PERCENT";
  discountValue: Dec | number | string;
  installationCharge?: Dec | number | string;
  transportationCharge?: Dec | number | string;
  taxEnabled: boolean;
  taxRate: Dec | number | string;
}

export interface Totals {
  lineTotals: Dec[];
  subtotal: Dec;
  discountTotal: Dec;
  taxTotal: Dec;
  total: Dec;
}

/** Tax base = subtotal − discount + installation + transportation. Tax is optional per document. */
export function computeTotals(i: TotalsInput): Totals {
  const lineTotals = i.lines.map((l) => money(D(l.quantity).times(D(l.unitPrice)).minus(D(l.discount ?? 0))));
  if (lineTotals.some((l) => l.isNegative())) throw new RangeError("line discount exceeds line amount");
  const subtotal = money(sum(lineTotals));
  const discountTotal = money(i.discountType === "PERCENT" ? subtotal.times(D(i.discountValue)).div(100) : D(i.discountValue));
  if (discountTotal.greaterThan(subtotal)) throw new RangeError("discount exceeds subtotal");
  const taxable = subtotal.minus(discountTotal).plus(D(i.installationCharge ?? 0)).plus(D(i.transportationCharge ?? 0));
  const taxTotal = i.taxEnabled ? money(taxable.times(D(i.taxRate)).div(100)) : ZERO;
  return { lineTotals, subtotal, discountTotal, taxTotal, total: money(taxable.plus(taxTotal)) };
}
