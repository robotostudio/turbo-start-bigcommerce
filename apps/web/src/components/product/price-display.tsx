import { formatMoney, getDiscountPercent } from "@/lib/shopify/money";
import type { MoneyV2 } from "@/lib/shopify/types";

type PriceDisplayProps = {
  price: MoneyV2;
  compareAtPrice: MoneyV2 | null;
};

export function PriceDisplay({ price, compareAtPrice }: PriceDisplayProps) {
  const savePercent = getDiscountPercent(price, compareAtPrice);
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
