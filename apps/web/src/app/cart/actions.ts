"use server";

import { Logger } from "@workspace/logger";
import { z } from "zod";

import {
  type BigCommerceCart,
  fromMerchandiseId,
  toInternalCart,
  toMerchandiseId,
} from "@/lib/bigcommerce/cart";
import {
  type CatalogProduct,
  getProductByPath,
} from "@/lib/bigcommerce/catalog";
import { classifyStorefrontFailure } from "@/lib/bigcommerce/classify";
import { storefrontQuery } from "@/lib/bigcommerce/client";
import { swatchHex } from "@/lib/bigcommerce/color";
import { graphql } from "@/lib/bigcommerce/graphql";
import { toMoney } from "@/lib/bigcommerce/money";
import {
  detectSilentClamps,
  type ExpectedTotal,
  type RequestedLine,
  requestedFromInputs,
} from "@/lib/cart/classify";
import { normalizeCart } from "@/lib/cart/engine";
import { clearCartId, getCartId, setCartId } from "@/lib/cart/server";
import type {
  Cart,
  CartActionResult,
  CartErrorCode,
  CartLineInput,
  ProductOption,
  ProductVariant,
} from "@/lib/cart/types";

const logger = new Logger("CartActions");

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/**
 * The subset of BigCommerce's cart `toInternalCart` reads. Physical and
 * digital items repeat the same field list because they are distinct GraphQL
 * types — only the multiple-choice option branch carries a `value`.
 */
const CartFields = graphql(`
  fragment CartFields on Cart {
    entityId
    currencyCode
    baseAmount {
      value
      currencyCode
    }
    amount {
      value
      currencyCode
    }
    lineItems {
      totalQuantity
      physicalItems {
        entityId
        productEntityId
        variantEntityId
        sku
        name
        path
        quantity
        image {
          url(width: 320)
          altText
        }
        selectedOptions {
          __typename
          name
          ... on CartSelectedMultipleChoiceOption {
            value
          }
        }
        salePrice {
          value
          currencyCode
        }
        extendedSalePrice {
          value
          currencyCode
        }
      }
      digitalItems {
        entityId
        productEntityId
        variantEntityId
        sku
        name
        path
        quantity
        image {
          url(width: 320)
          altText
        }
        selectedOptions {
          __typename
          name
          ... on CartSelectedMultipleChoiceOption {
            value
          }
        }
        salePrice {
          value
          currencyCode
        }
        extendedSalePrice {
          value
          currencyCode
        }
      }
    }
  }
`);

const GetCartQuery = graphql(
  `
  query GetCart($entityId: String!) {
    site {
      cart(entityId: $entityId) {
        ...CartFields
      }
    }
  }
`,
  [CartFields]
);

const CreateCartMutation = graphql(
  `
  mutation CreateCart($input: CreateCartInput!) {
    cart {
      createCart(input: $input) {
        cart {
          ...CartFields
        }
      }
    }
  }
`,
  [CartFields]
);

const AddCartLineItemsMutation = graphql(
  `
  mutation AddCartLineItems($input: AddCartLineItemsInput!) {
    cart {
      addCartLineItems(input: $input) {
        cart {
          ...CartFields
        }
      }
    }
  }
`,
  [CartFields]
);

const UpdateCartLineItemMutation = graphql(
  `
  mutation UpdateCartLineItem($input: UpdateCartLineItemInput!) {
    cart {
      updateCartLineItem(input: $input) {
        cart {
          ...CartFields
        }
      }
    }
  }
`,
  [CartFields]
);

const DeleteCartLineItemMutation = graphql(
  `
  mutation DeleteCartLineItem($input: DeleteCartLineItemInput!) {
    cart {
      deleteCartLineItem(input: $input) {
        cart {
          ...CartFields
        }
        deletedCartEntityId
      }
    }
  }
`,
  [CartFields]
);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const quantitySchema = z.number().int().min(1).max(99);
const idSchema = z.string().min(1);
const linesSchema = z
  .array(z.object({ merchandiseId: idSchema, quantity: quantitySchema }))
  .min(1);
const updateLineSchema = z.object({
  lineId: idSchema,
  quantity: quantitySchema,
  merchandiseId: idSchema,
});

function failure(code: CartErrorCode, message: string): CartActionResult {
  return { ok: false, error: { code, message } };
}

function invalidInput(error: z.ZodError): CartActionResult {
  return failure("INVALID_INPUT", error.issues[0]?.message ?? "Invalid input");
}

/**
 * `merchandiseId` -> the ids BigCommerce's line-item mutations take. Null when
 * the id was never one of ours, which surfaces as INVALID_INPUT rather than a
 * BigCommerce 400.
 */
function toLineItemInput(line: CartLineInput): {
  quantity: number;
  productEntityId: number;
  variantEntityId?: number;
} | null {
  const parsed = fromMerchandiseId(line.merchandiseId);
  if (!parsed) return null;
  return { quantity: line.quantity, ...parsed };
}

function toLineItemInputs(lines: CartLineInput[]) {
  const inputs = lines.map(toLineItemInput);
  return inputs.every((input) => input !== null) ? inputs : null;
}

// ---------------------------------------------------------------------------
// Settling
// ---------------------------------------------------------------------------

type StorefrontFailureResult = {
  ok: false;
  error: string;
  kind: "network" | "graphql" | "unknown";
  errors?: readonly { message: string; path?: readonly (string | number)[] }[];
};

async function settleTransportFailure(
  label: string,
  result: StorefrontFailureResult
): Promise<CartActionResult> {
  const classified = classifyStorefrontFailure({
    kind: result.kind,
    message: result.error,
    errors: result.errors,
  });
  if (
    classified.code === "CART_NOT_FOUND" ||
    classified.code === "CART_COMPLETED"
  ) {
    await clearCartId();
  }
  logger.error(`${label} failed: ${classified.message}`);
  return { ok: false, error: classified };
}

/**
 * BigCommerce reports no user errors and no warnings on a successful write —
 * refusals arrive as GraphQL errors and are settled before this. What remains
 * is normalising the cart and inferring the silent clamps.
 */
function settleCart(
  label: string,
  cart: BigCommerceCart | null | undefined,
  requested: RequestedLine[]
): CartActionResult {
  if (!cart) {
    return failure("UNKNOWN", `${label} returned no cart`);
  }
  const normalized = normalizeCart(toInternalCart(cart));
  const warnings = detectSilentClamps(normalized, requested, []);
  return { ok: true, cart: normalized, warnings };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function createCart(
  lines: CartLineInput[],
  expectedTotals?: ExpectedTotal[]
): Promise<CartActionResult> {
  const parsed = linesSchema.safeParse(lines);
  if (!parsed.success) return invalidInput(parsed.error);

  const lineItems = toLineItemInputs(parsed.data);
  if (!lineItems) {
    return failure("INVALID_INPUT", "Unrecognised merchandise id");
  }

  const result = await storefrontQuery(CreateCartMutation, {
    variables: { input: { lineItems } },
  });
  if (!result.ok) {
    return settleTransportFailure("createCart", result);
  }

  const settled = settleCart(
    "createCart",
    result.data.cart?.createCart?.cart,
    requestedFromInputs(parsed.data, expectedTotals)
  );
  if (settled.ok && settled.cart) {
    await setCartId(settled.cart.id);
  }
  return settled;
}

export async function addToCart(
  lines: CartLineInput[],
  expectedTotals?: ExpectedTotal[]
): Promise<CartActionResult> {
  const parsed = linesSchema.safeParse(lines);
  if (!parsed.success) return invalidInput(parsed.error);

  const cartId = await getCartId();
  if (!cartId) {
    return createCart(parsed.data, expectedTotals);
  }

  const lineItems = toLineItemInputs(parsed.data);
  if (!lineItems) {
    return failure("INVALID_INPUT", "Unrecognised merchandise id");
  }

  const result = await storefrontQuery(AddCartLineItemsMutation, {
    variables: { input: { cartEntityId: cartId, data: { lineItems } } },
  });
  if (!result.ok) {
    return settleTransportFailure("addToCart", result);
  }

  return settleCart(
    "addToCart",
    result.data.cart?.addCartLineItems?.cart,
    requestedFromInputs(parsed.data, expectedTotals)
  );
}

export async function updateCartLine(
  lineId: string,
  quantity: number,
  merchandiseId?: string
): Promise<CartActionResult> {
  // BigCommerce's update mutation requires the product ids even for a plain
  // quantity change, so the merchandise id is not optional here — the
  // controller passes the line's own id on quantity updates.
  const parsed = updateLineSchema.safeParse({
    lineId,
    quantity,
    merchandiseId,
  });
  if (!parsed.success) return invalidInput(parsed.error);

  const cartId = await getCartId();
  if (!cartId) {
    return failure("CART_NOT_FOUND", "No cart found");
  }

  const lineItem = toLineItemInput({
    merchandiseId: parsed.data.merchandiseId,
    quantity: parsed.data.quantity,
  });
  if (!lineItem) {
    return failure("INVALID_INPUT", "Unrecognised merchandise id");
  }

  const result = await storefrontQuery(UpdateCartLineItemMutation, {
    variables: {
      input: {
        cartEntityId: cartId,
        lineItemEntityId: parsed.data.lineId,
        data: { lineItem },
      },
    },
  });
  if (!result.ok) {
    return settleTransportFailure("updateCartLine", result);
  }

  const requested: RequestedLine[] = [
    {
      key: "merchandiseId",
      id: parsed.data.merchandiseId,
      quantity: parsed.data.quantity,
      exact: false,
    },
  ];

  return settleCart(
    "updateCartLine",
    result.data.cart?.updateCartLineItem?.cart,
    requested
  );
}

export async function removeCartLine(
  lineId: string
): Promise<CartActionResult> {
  const parsed = idSchema.safeParse(lineId);
  if (!parsed.success) return invalidInput(parsed.error);

  const cartId = await getCartId();
  if (!cartId) {
    return failure("CART_NOT_FOUND", "No cart found");
  }

  const result = await storefrontQuery(DeleteCartLineItemMutation, {
    variables: {
      input: { cartEntityId: cartId, lineItemEntityId: parsed.data },
    },
  });
  if (!result.ok) {
    return settleTransportFailure("removeCartLine", result);
  }

  const payload = result.data.cart?.deleteCartLineItem;

  // Removing the last line item deletes the cart itself. That is a successful
  // empty cart to the shopper, not an error — drop the dead cookie and report
  // no cart.
  if (payload?.deletedCartEntityId) {
    await clearCartId();
    return { ok: true, cart: null, warnings: [] };
  }

  return settleCart("removeCartLine", payload?.cart, []);
}

export async function getCart(): Promise<Cart | null> {
  const cartId = await getCartId();

  if (!cartId) {
    return null;
  }

  const result = await storefrontQuery(GetCartQuery, {
    variables: { entityId: cartId },
  });

  if (!result.ok) {
    logger.error(`Failed to fetch cart: ${result.error}`);
    throw new Error(`getCart failed (${result.kind}): ${result.error}`);
  }

  const cart = result.data.site.cart;
  if (!cart) {
    try {
      await clearCartId();
    } catch {
      logger.warning("Could not clear stale cart cookie outside an action");
    }
    return null;
  }

  return normalizeCart(toInternalCart(cart));
}

/**
 * Checkout stub. BigCommerce's checkout redirect URL is single-use, so it is
 * minted per click by the `createCartRedirectUrls` mutation and never stored —
 * which is why `Cart` carries no `checkoutUrl`. The minting and redirect land
 * in ROB-2544.
 */
export async function redirectToCheckout(): Promise<void> {
  logger.warn("redirectToCheckout is a stub until ROB-2544");
}

// ---------------------------------------------------------------------------
// Product options for the in-cart variant selectors
// ---------------------------------------------------------------------------

export type ProductOptions = {
  options: ProductOption[];
  variants: ProductVariant[];
};

type CatalogVariant = NonNullable<
  CatalogProduct["variants"]["edges"]
>[number]["node"];

function toProductVariant(
  productEntityId: number,
  variant: CatalogVariant
): ProductVariant {
  const selectedOptions = (variant.options.edges ?? []).map(({ node }) => ({
    name: node.displayName,
    value: node.values.edges?.[0]?.node.label ?? "",
  }));
  return {
    id: toMerchandiseId({ productEntityId, variantEntityId: variant.entityId }),
    title: selectedOptions.map((option) => option.value).join(" / "),
    availableForSale:
      variant.isPurchasable !== false && variant.inventory?.isInStock !== false,
    price: variant.prices
      ? toMoney(variant.prices.price)
      : { amount: "0.00", currencyCode: "" },
    // The variant selection carries no image; the cart payload's own line
    // image stands in after the swap confirms.
    image: null,
    selectedOptions,
  };
}

/**
 * Fetches a product's options and variants by handle — used to build the
 * in-cart Color/Size variant selectors. Returns null on error or missing
 * product so the caller can fall back to displaying the line's own options.
 */
export async function getProductOptions(
  handle: string
): Promise<ProductOptions | null> {
  const result = await getProductByPath([handle]);

  if (!result.ok) {
    logger.error(`Failed to fetch product options: ${result.error}`);
    return null;
  }

  const product = result.data.node;
  if (!product) {
    return null;
  }

  const options: ProductOption[] = (product.productOptions?.edges ?? []).map(
    ({ node }) => ({
      id: String(node.entityId),
      name: node.displayName,
      values:
        "values" in node
          ? (node.values?.edges ?? []).map(({ node: value }) => ({
              value: value.label,
              hex: "hexColors" in value ? swatchHex(value.hexColors) : null,
            }))
          : [],
    })
  );

  const variants = (product.variants?.edges ?? []).map(({ node }) =>
    toProductVariant(product.entityId, node)
  );

  return { options, variants };
}
