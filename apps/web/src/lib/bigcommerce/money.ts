/** Money as BigCommerce returns it: a number plus an ISO currency code. */
export type BigCommerceMoney = {
  value: number;
  currencyCode: string;
};

/** The app's internal money shape — a string amount plus a currency code. */
export type Money = {
  amount: string;
  currencyCode: string;
};

/**
 * The one place BigCommerce's numeric money becomes the internal string shape.
 * Keeping the conversion here means every price display, the cart totals and
 * their existing test suite carry on reading `{ amount, currencyCode }`.
 *
 * ponytail: two decimals, which covers every currency this store sells in.
 * Zero- and three-decimal currencies (JPY, KWD) would need the code's own
 * minor-unit count — `Intl.NumberFormat().resolvedOptions()` has it when needed.
 */
export function toMoney({ value, currencyCode }: BigCommerceMoney): Money {
  return { amount: value.toFixed(2), currencyCode };
}

/** Formats internal money to a locale-aware currency string. */
export function formatMoney(money: Money, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currencyCode,
  }).format(Number.parseFloat(money.amount));
}
