import type { MoneyV2 } from "./types";

/** Formats MoneyV2 to locale-aware currency string. */
export function formatMoney(money: MoneyV2, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currencyCode,
  }).format(Number.parseFloat(money.amount));
}

/**
 * Rounded discount percentage between `price` and `compareAtPrice`.
 * Returns 0 when there is no valid markdown (missing compareAt or price >= compareAt).
 */
export function getDiscountPercent(
  price: MoneyV2,
  compareAtPrice: MoneyV2 | null
): number {
  if (!compareAtPrice) return 0;
  const current = Number.parseFloat(price.amount);
  const compare = Number.parseFloat(compareAtPrice.amount);
  if (!(compare > current) || compare <= 0) return 0;
  return Math.round(((compare - current) / compare) * 100);
}
