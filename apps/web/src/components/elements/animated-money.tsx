"use client";

import NumberFlow from "@number-flow/react";

import { hasCurrency, PRICE_UNAVAILABLE } from "@/lib/bigcommerce/money";
import type { MoneyV2 } from "@/lib/cart/types";

/**
 * Animated counterpart of `formatMoney` — digits tween on change instead of
 * blipping. Locale must stay in lockstep with `formatMoney`'s default so
 * server-rendered strings and animated values never disagree.
 */
export function AnimatedMoney({
  money,
  className,
}: {
  money: MoneyV2;
  className?: string;
}) {
  // Same answer `formatMoney` gives for the same input: a code `Intl` rejects
  // would throw here too, and an amount with no currency is not a price.
  if (!hasCurrency(money.currencyCode)) {
    return <span className={className}>{PRICE_UNAVAILABLE}</span>;
  }

  return (
    <NumberFlow
      className={className}
      format={{ style: "currency", currency: money.currencyCode }}
      locales="en-US"
      value={Number.parseFloat(money.amount)}
    />
  );
}
