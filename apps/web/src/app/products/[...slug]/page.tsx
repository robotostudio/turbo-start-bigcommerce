import { notFound, redirect } from "next/navigation";
import sanitizeHtml from "sanitize-html";

import { BreadcrumbJsonLd } from "@/components/json-ld";
import { getProductDetail } from "@/components/product/fetch-product";
import { PriceDisplay } from "@/components/product/price-display";
import {
  type AccordionSection,
  ProductAccordion,
} from "@/components/product/product-accordion";
import type { CardVariant } from "@/components/product/product-card";
import { ProductGallery } from "@/components/product/product-gallery";
import { ProductJsonLd } from "@/components/product/product-json-ld";
import { ProductPurchase } from "@/components/product/product-purchase";
import { RelatedProducts } from "@/components/product/related-products";
import { VariantSelector } from "@/components/product/variant-selector";
import {
  findVariantByOptions,
  merchandiseId,
} from "@/components/product/variant-utils";
import { SavedItemButton } from "@/components/saved-items/saved-item-button";
import {
  type CatalogProduct,
  getProductByPath,
  getProductPaths,
  nodes,
  resolveSeo,
  toSegments,
} from "@/lib/bigcommerce/catalog";
import { swatchHex } from "@/lib/bigcommerce/color";
import { keyMetafields } from "@/lib/bigcommerce/metafields";
import { toMoney } from "@/lib/bigcommerce/money";
import { cardVariants } from "@/lib/bigcommerce/variant-utils";
import { fetchOrFallback } from "@/lib/build-guard";
import { buildLineMetadata } from "@/lib/cart/metadata";
import type { ProductOption } from "@/lib/cart/types";
import { getSEOMetadata } from "@/lib/seo";
import { getBaseUrl } from "@/utils";

type PageProps = {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string>>;
};

/**
 * Catch-all, not `[handle]`: a BigCommerce storefront path is whatever the
 * merchant made it, and `site.route` resolves the whole thing in one lookup.
 */
export async function generateStaticParams() {
  const paths = await fetchOrFallback(
    "BigCommerce product paths",
    "product pages render on demand instead of being prerendered",
    () => getProductPaths().then((r) => (r.ok ? r.data : [])),
    []
  );
  return paths.map((path) => ({ slug: toSegments(path) }));
}

/**
 * Page metadata from BigCommerce's own SEO fields.
 *
 * Every one of them is `""` rather than null when unset, so `??` never fires —
 * `resolveSeo` trims and falls back to the product's name and plain-text
 * description instead of shipping an empty `<title>`.
 */
export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const result = await getProductByPath(slug);
  if (!(result.ok && result.data.node)) return {};

  const product = result.data.node;
  const seo = resolveSeo(product.seo, {
    title: product.name,
    description: product.plainTextDescription,
  });

  return getSEOMetadata({
    title: seo.title,
    description: seo.description,
    slug: `/products/${slug.join("/")}`,
  });
}

/**
 * The PDP body copy.
 *
 * `description` is BigCommerce's rich-text field and arrives as HTML. The
 * `turbo_start` metafields hold everything the store models beyond it; a key
 * the seed didn't write simply has no section, which is why nothing here
 * renders an empty accordion panel.
 */
function buildAccordionSections(product: CatalogProduct): AccordionSection[] {
  const metafields = keyMetafields(product.metafields.edges);
  const sections: AccordionSection[] = [];

  if (product.description.trim()) {
    sections.push({
      id: "description",
      title: "Description",
      content: sanitizeHtml(product.description),
      isHtml: true,
    });
  }

  const metafieldSections: { id: string; title: string; value?: string }[] = [
    { id: "details", title: "Details", value: metafields.details },
    { id: "fit", title: "Fit & Sizing", value: metafields.fit_sizing },
    {
      id: "materials",
      title: "Materials & Composition",
      value: metafields.materials,
    },
    { id: "shipping", title: "Shipping & Returns", value: metafields.shipping },
  ];

  for (const { id, title, value } of metafieldSections) {
    if (value) sections.push({ id, title, content: value });
  }

  return sections;
}

/**
 * Product options as the selectors take them, with the swatch hex read off the
 * option value — BigCommerce carries it there, so there is no name-to-hex table
 * to keep in sync with the catalog.
 */
function toSelectorOptions(product: CatalogProduct): ProductOption[] {
  return nodes(product.productOptions).flatMap((option) => {
    if (option.__typename !== "MultipleChoiceOption") return [];
    const values = nodes(option.values).map((value) => ({
      value: value.label,
      hex:
        value.__typename === "SwatchOptionValue"
          ? swatchHex(value.hexColors)
          : null,
    }));
    return values.length > 0
      ? [{ id: String(option.entityId), name: option.displayName, values }]
      : [];
  });
}

function StockIndicator({ isInStock }: { isInStock: boolean }) {
  // `inventory.aggregated` is null across this store — it hides stock levels —
  // so there is no count to warn on, only in stock or not.
  return isInStock ? (
    <p className="text-muted-foreground text-sm">In stock</p>
  ) : null;
}

/**
 * The variant the page renders: whatever the URL asks for, falling back per
 * option to the first variant's own value so a bare PDP URL still lands on
 * something buyable.
 *
 * `complete` is what gates the CTA — an option the shopper hasn't chosen yet
 * must read "Select Options", not silently add the default.
 */
function resolveSelection(
  options: ProductOption[],
  variants: CardVariant[],
  searchParams: Record<string, string>
) {
  const [defaultVariant] = variants;
  const selections: Record<string, string> = {};

  for (const option of options) {
    selections[option.name] =
      searchParams[option.name] ??
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

/** The was-price for the strikethrough, or null when nothing is marked down. */
function compareAtFor(product: CatalogProduct, variantId: string) {
  const prices = nodes(product.variants).find(
    (variant) => String(variant.entityId) === variantId
  )?.prices;
  // A markdown puts the pre-markdown figure in `basePrice`; without one,
  // `retailPrice` is a standing MSRP. `PriceDisplay` ignores either if it isn't
  // actually above the price being charged.
  const was = prices?.salePrice ? prices.basePrice : prices?.retailPrice;
  return was ? toMoney(was) : null;
}

export default async function ProductPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;

  // Two reads, not one: `site.route` resolves the merchant's URL and its
  // auto-created 301, but drops `productOptions` on the way — see
  // `getProductDetail`.
  const route = await getProductDetail(slug);

  // A merchant rename auto-creates a 301, and `redirectBehavior: FOLLOW` hands
  // back both the destination and its canonical URL. Send the shopper (and the
  // crawler) to the canonical one rather than rendering under the stale path.
  if (route.redirectTo) redirect(route.redirectTo);
  if (!route.node) notFound();

  const product = route.node;
  const handle = slug.join("/");
  const images = nodes(product.images);
  const options = toSelectorOptions(product);
  const variants = cardVariants(product);

  const { complete: allOptionsSelected, variant: selectedVariant } =
    resolveSelection(options, variants, sp);
  if (!selectedVariant) notFound();

  const compareAt = compareAtFor(product, selectedVariant.id);
  const title = product.name;
  const vendor = product.brand?.name ?? null;
  // Product `type` is BigCommerce's Physical/Digital flag, not a merchandising
  // category — the seed carries that as a metafield.
  const category = keyMetafields(product.metafields.edges).product_type;

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

  const accordionSections = buildAccordionSections(product);
  const baseUrl = getBaseUrl();

  return (
    <>
      <ProductJsonLd
        description={product.plainTextDescription}
        handle={handle}
        product={product}
      />
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: baseUrl },
          { name: "Collections", url: `${baseUrl}/collections` },
          { name: title },
        ]}
      />
      <div className="site-container py-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)] xl:grid-cols-[minmax(0,1fr)_minmax(0,600px)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,760px)]">
          {/* Info column — sticky on desktop, uniform 32px rhythm */}
          <div className="flex min-w-0 max-w-2xl flex-col gap-8 self-start lg:sticky lg:top-24">
            {/* Season / brand eyebrow + save */}
            <div className="flex items-start justify-between gap-4">
              {vendor ? (
                <p className="text-muted-foreground text-sm">{vendor}</p>
              ) : (
                <span />
              )}
              {/* 44px hitbox passed from here, not baked into SavedItemButton:
               * on a ProductCard it sits absolutely over the product link, and
               * an invisible 44px box there would eat clicks meant for the
               * product. */}
              <SavedItemButton
                className="relative text-muted-foreground hover:text-foreground before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']"
                handle={handle}
              />
            </div>

            {/* Category + title + price */}
            <div className="flex flex-col gap-2">
              {category && (
                <p className="text-muted-foreground text-sm">{category}</p>
              )}
              <h1 className="font-medium text-2xl tracking-tight lg:text-3xl">
                {title}
              </h1>
              <PriceDisplay
                compareAtPrice={compareAt}
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
                // `aggregated` is null store-wide, so there is no ceiling to
                // clamp the quantity stepper to.
                quantityAvailable={null}
                variantId={merchandiseId(product.entityId, selectedVariant.id)}
              />
              <StockIndicator isInStock={selectedVariant.availableForSale} />
            </div>

            {/* Accordion — Description + metafields */}
            {accordionSections.length > 0 && (
              <ProductAccordion
                defaultOpenId="description"
                sections={accordionSections}
              />
            )}
          </div>

          {/* Gallery — vertical thumbnail rail + scrolling image column */}
          <ProductGallery
            images={images}
            selectedVariantImageUrl={selectedVariant.image?.url}
          />
        </div>

        <RelatedProducts product={product} />
      </div>
    </>
  );
}
