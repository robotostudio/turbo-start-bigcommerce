import { describe, expect, it } from "vitest";

import { addMoney, multiplyMoney, zeroMoney } from "@/lib/cart/money";

const usd = (amount: string) => ({ amount, currencyCode: "USD" });

describe("addMoney", () => {
  it("avoids float drift", () => {
    expect(addMoney(usd("0.1"), usd("0.2")).amount).toBe("0.30");
  });

  it("keeps the left operand currency", () => {
    const result = addMoney(usd("1.00"), {
      amount: "2.00",
      currencyCode: "EUR",
    });
    expect(result).toEqual(usd("3.00"));
  });

  it("stays exact across many accumulations", () => {
    let sum = zeroMoney("USD");
    for (let i = 0; i < 100; i += 1) {
      sum = addMoney(sum, usd("0.10"));
    }
    expect(sum.amount).toBe("10.00");
  });

  it("handles negative amounts", () => {
    expect(addMoney(usd("5.00"), usd("-1.25")).amount).toBe("3.75");
  });
});

describe("multiplyMoney", () => {
  it("multiplies without drift", () => {
    expect(multiplyMoney(usd("19.99"), 3).amount).toBe("59.97");
  });

  it("handles quantities that trip float math", () => {
    expect(multiplyMoney(usd("0.10"), 3).amount).toBe("0.30");
  });

  it("multiplying by zero yields 0.00", () => {
    expect(multiplyMoney(usd("42.42"), 0).amount).toBe("0.00");
  });

  it("formats whole numbers with two decimals", () => {
    expect(multiplyMoney(usd("2.50"), 4).amount).toBe("10.00");
  });
});

describe("zeroMoney", () => {
  it("returns 0.00 in the given currency", () => {
    expect(zeroMoney("GBP")).toEqual({ amount: "0.00", currencyCode: "GBP" });
  });
});
