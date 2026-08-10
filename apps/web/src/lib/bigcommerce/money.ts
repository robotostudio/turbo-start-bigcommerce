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

/** `Intl` accepts a three-letter ISO 4217 code and throws on anything else. */
const ISO_CURRENCY = /^[A-Za-z]{3}$/;

/**
 * What a price renders as when there is no currency to state it in.
 *
 * Not the bare number: an amount with no currency is `0.00` in every case this
 * can actually reach, and a product priced `0.00` reads as free rather than as
 * unknown. A dash says the price is missing, which is the true thing.
 */
export const PRICE_UNAVAILABLE = "—";

/**
 * Whether this code is one `Intl` will accept.
 *
 * `Intl.NumberFormat(locale, { style: "currency", currency: "" })` throws
 * `RangeError: Invalid currency code`, and the empty code is a value this app
 * mints itself: `toCardVariant` falls back to `{ amount: "0.00", currencyCode:
 * "" }` for a variant BigCommerce returns with no `prices` node. On the PDP
 * that is the default variant, so the throw took the product page down with it.
 *
 * Exported so `AnimatedMoney` — the other place a currency code reaches `Intl`
 * — answers the same input the same way.
 */
export function hasCurrency(currencyCode: string): boolean {
  return ISO_CURRENCY.test(currencyCode);
}

/** Formats internal money to a locale-aware currency string. */
export function formatMoney(money: Money, locale = "en-US"): string {
  if (!hasCurrency(money.currencyCode)) return PRICE_UNAVAILABLE;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currencyCode,
  }).format(Number.parseFloat(money.amount));
}
