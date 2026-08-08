import { formatMoney } from "@/lib/bigcommerce/money";
import type { MoneyV2 } from "@/lib/cart/types";

type PriceDisplayProps = {
  price: MoneyV2;
  compareAtPrice: MoneyV2 | null;
};

/**
 * Rounded markdown between `price` and `compareAtPrice`. 0 when there is no
 * genuine markdown, so a retail price at or below the price charged never
 * renders as a discount.
 */
function discountPercent(price: MoneyV2, compareAtPrice: MoneyV2 | null) {
  if (!compareAtPrice) return 0;
  const current = Number.parseFloat(price.amount);
  const compare = Number.parseFloat(compareAtPrice.amount);
  if (!(compare > current) || compare <= 0) return 0;
  return Math.round(((compare - current) / compare) * 100);
}

export function PriceDisplay({ price, compareAtPrice }: PriceDisplayProps) {
  const savePercent = discountPercent(price, compareAtPrice);
  const isOnSale = savePercent > 0;

  return (
    <div className="flex items-end gap-2">
      {isOnSale && (
        <span className="text-base text-red-500">-{savePercent}%</span>
      )}
      <span className="font-medium text-xl">{formatMoney(price)}</span>
      {isOnSale && compareAtPrice && (
        <span className="text-muted-foreground text-sm line-through">
          {formatMoney(compareAtPrice)}
        </span>
      )}
    </div>
  );
}
