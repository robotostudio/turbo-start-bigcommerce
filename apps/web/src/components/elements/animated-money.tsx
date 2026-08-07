"use client";

import NumberFlow from "@number-flow/react";

import type { MoneyV2 } from "@/lib/shopify/types";

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
  return (
    <NumberFlow
      className={className}
      format={{ style: "currency", currency: money.currencyCode }}
      locales="en-US"
      value={Number.parseFloat(money.amount)}
    />
  );
}
