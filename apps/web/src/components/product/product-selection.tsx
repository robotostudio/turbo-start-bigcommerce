"use client";

import { useSearchParams } from "next/navigation";

import { PriceDisplay } from "@/components/product/price-display";
import type { CardVariant } from "@/components/product/product-card";
import { ProductGallery } from "@/components/product/product-gallery";
import { ProductPurchase } from "@/components/product/product-purchase";
import { VariantSelector } from "@/components/product/variant-selector";
import {
  findVariantByOptions,
  merchandiseId,
} from "@/components/product/variant-utils";
import { buildLineMetadata } from "@/lib/cart/metadata";
import type { MoneyV2, ProductOption } from "@/lib/cart/types";

/**
 * The PDP's `?Color=`-driven half.
 *
 * The page itself never awaits `searchParams` — that would opt the whole
 * route out of static generation. The prerendered HTML shows the default
 * variant; these components re-resolve from the URL on the client, which is
 * also what keeps the selection live as `VariantSelector` rewrites the query
 * string.
 */

/**
 * The variant to render: whatever the URL asks for, falling back per option
 * to the first variant's own value so a bare PDP URL still lands on
 * something buyable.
 *
 * `complete` is what gates the CTA — an option the shopper hasn't chosen yet
 * must read "Select Options", not silently add the default.
 */
export function resolveSelection(
  options: ProductOption[],
  variants: CardVariant[],
  searchParams: { get(name: string): string | null }
) {
  const [defaultVariant] = variants;
  const selections: Record<string, string> = {};

  for (const option of options) {
    selections[option.name] =
      searchParams.get(option.name) ??
      defaultVariant?.selectedOptions.find((s) => s.name === option.name)
        ?.value ??
      "";
  }

  return {
    complete: options
      .filter((option) => option.values.length > 1)
      .every((option) =>
        option.values.some((v) => v.value === selections[option.name])
      ),
    variant: findVariantByOptions(variants, selections) ?? defaultVariant,
  };
}

function StockIndicator({ isInStock }: { isInStock: boolean }) {
  // `inventory.aggregated` is null across this store — it hides stock levels —
  // so there is no count to warn on, only in stock or not.
  return isInStock ? (
    <p className="text-muted-foreground text-sm">In stock</p>
  ) : null;
}

type ProductSelectionProps = {
  handle: string;
  productEntityId: number;
  title: string;
  category: string | undefined;
  options: ProductOption[];
  variants: CardVariant[];
  /** Keyed by `CardVariant.id`; the strikethrough price when marked down. */
  compareAtByVariantId: Record<string, MoneyV2 | null>;
};

/** Category + title + price, selectors, and the add-to-cart row. */
export function ProductSelection({
  handle,
  productEntityId,
  title,
  category,
  options,
  variants,
  compareAtByVariantId,
}: ProductSelectionProps) {
  const searchParams = useSearchParams();
  const { complete: allOptionsSelected, variant: selectedVariant } =
    resolveSelection(options, variants, searchParams);

  if (!selectedVariant) return null;

  const lineMetadata = buildLineMetadata({
    productTitle: title,
    productHandle: handle,
    price: selectedVariant.price,
    selectedOptions: selectedVariant.selectedOptions,
    image: selectedVariant.image?.url
      ? {
          url: selectedVariant.image.url,
          altText: title,
          width: 0,
          height: 0,
        }
      : null,
  });

  return (
    <>
      {/* Category + title + price */}
      <div className="flex flex-col gap-2">
        {category && (
          <p className="text-muted-foreground text-sm">{category}</p>
        )}
        <h1 className="font-medium text-2xl tracking-tight lg:text-3xl">
          {title}
        </h1>
        <PriceDisplay
          compareAtPrice={compareAtByVariantId[selectedVariant.id] ?? null}
          price={selectedVariant.price}
        />
      </div>

      {/* Variant selectors */}
      {variants.length > 0 && (
        <VariantSelector
          handle={handle}
          options={options}
          variants={variants}
        />
      )}

      {/* Add to cart + stock */}
      <div className="flex flex-col gap-2">
        <ProductPurchase
          availableForSale={selectedVariant.availableForSale}
          metadata={lineMetadata}
          optionsSelected={allOptionsSelected}
          // `aggregated` is null store-wide, so there is no ceiling to clamp
          // the quantity stepper to.
          quantityAvailable={null}
          variantId={merchandiseId(productEntityId, selectedVariant.id)}
        />
        <StockIndicator isInStock={selectedVariant.availableForSale} />
      </div>
    </>
  );
}

type SelectedVariantGalleryProps = {
  images: { url: string; altText?: string | null; isDefault?: boolean }[];
  options: ProductOption[];
  variants: CardVariant[];
};

/** The gallery, following the same URL-driven selection as the info column. */
export function SelectedVariantGallery({
  images,
  options,
  variants,
}: SelectedVariantGalleryProps) {
  const searchParams = useSearchParams();
  const { variant } = resolveSelection(options, variants, searchParams);

  return (
    <ProductGallery
      images={images}
      selectedVariantImageUrl={variant?.image?.url}
    />
  );
}
