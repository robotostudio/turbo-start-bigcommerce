"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";

import { AnimatedMoney } from "@/components/elements/animated-money";
import { BookmarkIcon } from "@/components/icons";
import { QuantitySelector } from "@/components/product/quantity-selector";
import { ShopifyImage as Image } from "@/components/product/shopify-image";
import { useSavedItems } from "@/components/saved-items/saved-items-context";
import { isSyntheticLineId } from "@/lib/cart/intents";
import { getColorHex } from "@/lib/shopify/color";
import { getOptionType } from "@/lib/shopify/options";
import type { CartLine, SelectedOption } from "@/lib/shopify/types";
import {
  findVariantByOptions,
  getOptionAvailability,
} from "@/lib/shopify/variant-utils";
import { useCart } from "./cart-context";
import {
  CartLineVariantSelect,
  type VariantOption,
} from "./cart-line-variant-select";
import { useProductOptions } from "./use-product-options";

const DEFAULT_TITLE = "Default Title";

function selectionsFromOptions(
  options: SelectedOption[]
): Record<string, string> {
  const record: Record<string, string> = {};
  for (const option of options) {
    record[option.name] = option.value;
  }
  return record;
}

function buildProductUrl(line: CartLine): string {
  const handle = line.merchandise.product.handle;
  const params = new URLSearchParams();
  for (const opt of line.merchandise.selectedOptions) {
    if (opt.value && opt.value !== DEFAULT_TITLE) {
      params.set(opt.name, opt.value);
    }
  }
  const qs = params.toString();
  return `/products/${handle}${qs ? `?${qs}` : ""}`;
}

export function CartLineItem({ line }: { line: CartLine }) {
  const { updateLine, swapLineVariant, removeLine, closeCart, cartError } =
    useCart();
  const { add: addToWishlist } = useSavedItems();
  const handle = line.merchandise.product.handle;
  const { data: productOptions } = useProductOptions(handle);
  const isSynthetic = isSyntheticLineId(line.id);
  const lineError = cartError?.lineId === line.id ? cartError : null;

  const productUrl = buildProductUrl(line);
  const currentSelections = selectionsFromOptions(
    line.merchandise.selectedOptions
  );

  // Prefer the fetched product options (all values + availability); fall back
  // to the line's own selected options as read-only single-value selectors.
  const optionDefs =
    productOptions?.options ??
    line.merchandise.selectedOptions.map((option) => ({
      id: option.name,
      name: option.name,
      values: [option.value],
    }));
  const variants = productOptions?.variants ?? [];

  function handleSelect(optionName: string, nextValue: string) {
    const next = { ...currentSelections, [optionName]: nextValue };
    const target = findVariantByOptions(variants, next);
    if (target?.availableForSale) {
      swapLineVariant(line.id, target.id, line.quantity, {
        variantTitle: target.title,
        price: target.price,
        image: target.image,
        selectedOptions: target.selectedOptions,
      });
    }
  }

  function handleMoveToWishlist() {
    addToWishlist(handle);
    removeLine(line.id);
  }

  const selectableOptions = optionDefs.filter(
    (option) =>
      !(option.values.length === 1 && option.values[0] === DEFAULT_TITLE)
  );

  return (
    <div className="flex items-stretch justify-between gap-4 py-8 first:pt-0">
      <div className="flex flex-1 flex-col items-start gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <Link
              className="font-medium text-base text-foreground leading-tight hover:underline"
              href={productUrl}
              onClick={closeCart}
            >
              {line.merchandise.product.title}
            </Link>
            <p className="font-medium text-foreground text-sm tabular-nums">
              <AnimatedMoney money={line.cost.totalAmount} />
            </p>
          </div>

          <div className="flex flex-col gap-1">
            {selectableOptions.map((option) => {
              const type = getOptionType(option.name);
              const availability = getOptionAvailability(
                variants,
                option.name,
                currentSelections
              );
              const values: VariantOption[] = option.values.map((value) => ({
                value,
                available: availability[value] ?? variants.length === 0,
                hex: type === "color" ? getColorHex(value) : null,
              }));
              return (
                <CartLineVariantSelect
                  disabled={isSynthetic}
                  key={option.name}
                  label={option.name}
                  onSelect={(value) => handleSelect(option.name, value)}
                  options={values}
                  type={type}
                  value={currentSelections[option.name] ?? ""}
                />
              );
            })}
          </div>

          {lineError && (
            <p className="text-red-600 text-sm">{lineError.message}</p>
          )}
        </div>

        <QuantitySelector
          disabled={isSynthetic}
          onChange={(value) => updateLine(line.id, value)}
          value={line.quantity}
        />

        <div className="flex items-center gap-4">
          <button
            className="inline-flex items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
            onClick={handleMoveToWishlist}
            type="button"
          >
            {/* size-5, not size-4, to sit level with the size-4 lucide Trash2
             * below: lucide's 24-unit box is filled ~83% by its glyph, ours
             * ~69%, so matching the ink means not matching the box. */}
            <BookmarkIcon className="size-5" />
            Move to wishlist
          </button>
          <button
            className="inline-flex items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
            onClick={() => removeLine(line.id)}
            type="button"
          >
            <Trash2 className="size-4" />
            Remove
          </button>
        </div>
      </div>

      <Link
        className="card-surface relative w-31.25 shrink-0 self-stretch overflow-hidden"
        href={productUrl}
        onClick={closeCart}
      >
        {line.merchandise.image && (
          <Image
            alt={line.merchandise.image.altText ?? line.merchandise.title}
            className="object-cover"
            fill
            sizes="125px"
            src={line.merchandise.image.url}
          />
        )}
      </Link>
    </div>
  );
}
