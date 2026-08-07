import type { MoneyV2 } from "@/lib/shopify/types";

function toMinorUnits(amount: string): number {
  const parsed = Number.parseFloat(amount);
  if (Number.isNaN(parsed)) return 0;
  return Math.round(parsed * 100);
}

function fromMinorUnits(units: number): string {
  return (units / 100).toFixed(2);
}

export function addMoney(a: MoneyV2, b: MoneyV2): MoneyV2 {
  return {
    amount: fromMinorUnits(toMinorUnits(a.amount) + toMinorUnits(b.amount)),
    currencyCode: a.currencyCode,
  };
}

export function multiplyMoney(money: MoneyV2, quantity: number): MoneyV2 {
  return {
    amount: fromMinorUnits(toMinorUnits(money.amount) * quantity),
    currencyCode: money.currencyCode,
  };
}

export function zeroMoney(currencyCode: string): MoneyV2 {
  return { amount: "0.00", currencyCode };
}
