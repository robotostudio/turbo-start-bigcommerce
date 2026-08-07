import type {
  Cart,
  MoneyV2,
  SelectedOption,
  ShopifyImage,
} from "@/lib/shopify/types";

export type LineMetadata = {
  productTitle: string;
  productHandle: string;
  variantTitle: string;
  price: MoneyV2;
  image: ShopifyImage | null;
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
  | "SHOPIFY_USER_ERROR"
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

export type CartActionResult =
  | { ok: true; cart: Cart; warnings: CartWarning[] }
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
