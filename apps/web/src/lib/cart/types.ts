/**
 * The internal cart model. The engine, controller and cart UI all run on these
 * shapes; the BigCommerce adapters in `lib/bigcommerce/cart.ts` normalise into
 * them.
 *
 * There is deliberately no `checkoutUrl` on `Cart`: BigCommerce's checkout
 * redirect URL is single-use, so it must be minted per click
 * (`redirectToCheckout`), never carried on the cart where it could be cached.
 */

export type MoneyV2 = {
  amount: string;
  currencyCode: string;
};

export type CartImage = {
  url: string;
  altText: string | null;
  width: number;
  height: number;
};

export type SelectedOption = {
  name: string;
  value: string;
};

export type Connection<T> = {
  edges: { node: T }[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
};

export type CartLine = {
  id: string;
  quantity: number;
  merchandise: {
    id: string;
    title: string;
    image: CartImage | null;
    product: {
      handle: string;
      title: string;
    };
    selectedOptions: SelectedOption[];
    price: MoneyV2;
  };
  cost: {
    amountPerQuantity: MoneyV2;
    totalAmount: MoneyV2;
  };
};

export type Cart = {
  id: string;
  totalQuantity: number;
  lines: Connection<CartLine>;
  cost: {
    totalAmount: MoneyV2;
    subtotalAmount: MoneyV2;
    totalTaxAmount: MoneyV2 | null;
  };
};

export type CartLineInput = {
  merchandiseId: string;
  quantity: number;
};

/** One option value with its swatch hex, when the merchant styled one. */
export type ProductOptionValue = {
  value: string;
  hex: string | null;
};

export type ProductOption = {
  id: string;
  name: string;
  values: ProductOptionValue[];
};

/** A purchasable variant as the in-cart variant selectors need it. */
export type ProductVariant = {
  id: string;
  title: string;
  availableForSale: boolean;
  price: MoneyV2;
  image: CartImage | null;
  selectedOptions: SelectedOption[];
};

export type LineMetadata = {
  productTitle: string;
  productHandle: string;
  variantTitle: string;
  price: MoneyV2;
  image: CartImage | null;
  selectedOptions: SelectedOption[];
};

export type CartIntent =
  | { kind: "add"; variantId: string; quantity: number; metadata: LineMetadata }
  | { kind: "update"; lineId: string; quantity: number }
  | {
      kind: "swap";
      lineId: string;
      merchandiseId: string;
      quantity: number;
      metadata?: Partial<LineMetadata>;
    }
  | { kind: "remove"; lineId: string };

export type CartErrorCode =
  | "NETWORK"
  | "INVALID_INPUT"
  | "CART_NOT_FOUND"
  | "CART_COMPLETED"
  | "VARIANT_UNAVAILABLE"
  | "STOREFRONT_USER_ERROR"
  | "UNKNOWN";

export type CartWarning = {
  code: "QUANTITY_CLAMPED" | "LINE_DROPPED" | "PRICE_CHANGED" | "OTHER";
  lineId?: string;
  message: string;
};

export type CartError = {
  intentKind: CartIntent["kind"];
  lineId?: string;
  code: CartErrorCode;
  message: string;
  retryable: boolean;
};

/**
 * `cart: null` on success means the backend deleted the cart — BigCommerce
 * does this when the last line item is removed.
 */
export type CartActionResult =
  | { ok: true; cart: Cart | null; warnings: CartWarning[] }
  | { ok: false; error: { code: CartErrorCode; message: string } };

export type CartSnapshot = {
  cart: Cart | null;
  cartWithPending: Cart | null;
  isMutating: boolean;
  isCreatingCart: boolean;
  hasPendingAdds: boolean;
  pendingQuantity: number;
  error: CartError | null;
  warnings: CartWarning[];
};
