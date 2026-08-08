import { type BigCommerceMoney, toMoney } from "@/lib/bigcommerce/money";
import type { Cart, CartLine } from "@/lib/cart/types";

/**
 * BigCommerce cart payload -> the internal cart type the cart engine and
 * controller already run on.
 *
 * The one structural difference worth naming: BigCommerce splits a cart into
 * `physicalItems` and `digitalItems` and never merges them. The internal cart
 * has a single line list, so they concatenate here.
 */

/**
 * Fields common to `CartPhysicalItem` and `CartDigitalItem`. Deliberately the
 * intersection, not the union: a digital item carries no `isShippingRequired`
 * and no `discounts`, so requiring either would reject half the cart.
 */
type BigCommerceCartItem = {
  entityId: string;
  productEntityId: number;
  variantEntityId?: number | null;
  sku?: string | null;
  name: string;
  path: string;
  quantity: number;
  image?: { url: string; altText?: string | null } | null;
  /** Only the multiple-choice branch carries `value`; text/number ones do not. */
  selectedOptions: readonly { name: string; value?: string | null }[];
  salePrice: BigCommerceMoney;
  extendedSalePrice: BigCommerceMoney;
};

export type BigCommerceCart = {
  entityId: string;
  /** Nullable in BigCommerce's schema, and present on every cart it returns. */
  version?: number | null;
  currencyCode: string;
  baseAmount: BigCommerceMoney;
  amount: BigCommerceMoney;
  lineItems: {
    totalQuantity: number;
    physicalItems: readonly BigCommerceCartItem[];
    digitalItems: readonly BigCommerceCartItem[];
  };
};

/**
 * BigCommerce's cart image field exposes no dimensions and the cart fragment
 * pins `url(width: 320)`. The only consumer renders with `fill`, so both are
 * nominal.
 */
const CART_IMAGE_SIZE = 320;

/**
 * `merchandise.id` has to round-trip into the line-item mutations, which take
 * `productEntityId` *and* `variantEntityId`, and the two id spaces overlap — so
 * neither half identifies a purchasable on its own.
 */
export function toMerchandiseId(item: {
  productEntityId: number;
  variantEntityId?: number | null;
}): string {
  return item.variantEntityId == null
    ? String(item.productEntityId)
    : `${item.productEntityId}:${item.variantEntityId}`;
}

/**
 * The inverse of `toMerchandiseId`, for feeding a merchandise id back into the
 * line-item mutations. Returns null when the id is not one this module minted.
 */
export function fromMerchandiseId(
  merchandiseId: string
): { productEntityId: number; variantEntityId?: number } | null {
  const [product, variant, extra] = merchandiseId.split(":");
  if (extra !== undefined) return null;
  const productEntityId = Number(product);
  if (!Number.isInteger(productEntityId) || productEntityId <= 0) return null;
  if (variant === undefined) return { productEntityId };
  const variantEntityId = Number(variant);
  if (!Number.isInteger(variantEntityId) || variantEntityId <= 0) return null;
  return { productEntityId, variantEntityId };
}

/** `/products/wren-washed-cap/` and `/care-guide/` both yield a bare slug. */
function handleFromPath(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? "";
}

function toLine(item: BigCommerceCartItem): CartLine {
  const optionValues = item.selectedOptions
    .map((option) => option.value)
    .filter((value): value is string => Boolean(value));
  return {
    id: item.entityId,
    quantity: item.quantity,
    merchandise: {
      id: toMerchandiseId(item),
      title: optionValues.join(" / ") || item.sku || item.name,
      image: item.image
        ? {
            url: item.image.url,
            altText: item.image.altText ?? null,
            width: CART_IMAGE_SIZE,
            height: CART_IMAGE_SIZE,
          }
        : null,
      product: { handle: handleFromPath(item.path), title: item.name },
      selectedOptions: item.selectedOptions.map((option) => ({
        name: option.name,
        value: option.value ?? "",
      })),
      price: toMoney(item.salePrice),
    },
    cost: {
      amountPerQuantity: toMoney(item.salePrice),
      totalAmount: toMoney(item.extendedSalePrice),
    },
  };
}

export function toInternalCart(cart: BigCommerceCart): Cart {
  const lines = [
    ...cart.lineItems.physicalItems,
    ...cart.lineItems.digitalItems,
  ].map(toLine);
  return {
    id: cart.entityId,
    version: cart.version ?? null,
    // BigCommerce's own count, which also spans gift certificates and custom
    // items. `finalize()` recomputes it from lines on the first fold, so it can
    // only differ on an untouched server cart.
    totalQuantity: cart.lineItems.totalQuantity,
    lines: {
      edges: lines.map((node) => ({ node })),
      pageInfo: { hasNextPage: false, endCursor: null },
    },
    cost: {
      subtotalAmount: toMoney(cart.baseAmount),
      totalAmount: toMoney(cart.amount),
      // Not in the cart payload; `isTaxIncluded` says whether tax is baked into
      // `amount`, not how much of it is tax.
      totalTaxAmount: null,
    },
  };
}
