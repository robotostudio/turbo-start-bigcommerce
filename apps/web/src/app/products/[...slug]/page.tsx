import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import sanitizeHtml from "sanitize-html";

import { BreadcrumbJsonLd } from "@/components/json-ld";
import { getProductDetail } from "@/components/product/fetch-product";
import { PriceDisplay } from "@/components/product/price-display";
import {
  type AccordionSection,
  ProductAccordion,
} from "@/components/product/product-accordion";
import { ProductGallery } from "@/components/product/product-gallery";
import { ProductJsonLd } from "@/components/product/product-json-ld";
import {
  ProductSelection,
  SelectedVariantGallery,
} from "@/components/product/product-selection";
import { ProductUnavailable } from "@/components/product/product-unavailable";
import { RatingStars } from "@/components/product/rating-stars";
import { RelatedProducts } from "@/components/product/related-products";
import { SavedItemButton } from "@/components/saved-items/saved-item-button";
import {
  type CatalogProduct,
  getProductPaths,
  nodes,
  resolveSeo,
  toSegments,
} from "@/lib/bigcommerce/catalog";
import { swatchHex } from "@/lib/bigcommerce/color";
import { keyMetafields } from "@/lib/bigcommerce/metafields";
import { toMoney } from "@/lib/bigcommerce/money";
import { cardRating } from "@/lib/bigcommerce/product-card";
import { cardVariants } from "@/lib/bigcommerce/variant-utils";
import { fetchOrFallback } from "@/lib/build-guard";
import type { MoneyV2, ProductOption } from "@/lib/cart/types";
import { getSEOMetadata } from "@/lib/seo";
import { getBaseUrl } from "@/utils";

/**
 * No `searchParams`, deliberately: awaiting it opts the route out of static
 * generation. The `?Color=` selection is URL state, read on the client by
 * `ProductSelection` / `SelectedVariantGallery`; the catalog read keys on the
 * path alone, so the prerendered page is the default variant and the client
 * re-resolves from the query string.
 */
type PageProps = {
  params: Promise<{ slug: string[] }>;
};

/**
 * Without this the prerendered PDP serves the price and stock captured at build
 * time, forever. The catalog read is a POST, which Next never serves from the
 * fetch cache, so page-level ISR is the only thing that refreshes commerce data.
 *
 * One minute, and shorter than the category pages, because the PDP is where a
 * shopper commits: a wrong price or an "in stock" badge on a sold-out item fails
 * visibly and immediately. There are also far fewer PDPs than category pages, so
 * the regeneration cost of a short window is bounded.
 */
export const revalidate = 60;

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
  // The same cached read the body runs, so metadata costs no extra request. A
  // refused read leaves the page its fallback metadata, because `node` is null
  // either way; a bug still throws out of here, the same as it does out of the
  // body, and a page that cannot render is not worth a `<title>` for.
  const route = await getProductDetail(slug);
  if (!route.node) return {};

  const product = route.node;
  const seo = resolveSeo(product.seo, {
    title: product.name,
    description: product.plainTextDescription,
  });

  return getSEOMetadata({
    title: seo.title,
    description: seo.description,
    slug: `/products/${slug.join("/")}`,
    // Keys the Open Graph card, which re-reads the product live. The entity id
    // rather than the path: a merchant rename leaves a scraped card pointing at
    // an id that still resolves.
    contentType: "product",
    contentId: String(product.entityId),
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

/**
 * The was-price for every variant, keyed by card variant id — computed here
 * so the client selection component gets a serialisable map instead of the
 * raw prices payload.
 *
 * A markdown puts the pre-markdown figure in `basePrice`; without one,
 * `retailPrice` is a standing MSRP. `PriceDisplay` ignores either if it isn't
 * actually above the price being charged.
 */
function compareAtByVariantId(
  product: CatalogProduct
): Record<string, MoneyV2 | null> {
  const map: Record<string, MoneyV2 | null> = {};
  for (const variant of nodes(product.variants)) {
    const prices = variant.prices;
    const was = prices?.salePrice ? prices.basePrice : prices?.retailPrice;
    map[String(variant.entityId)] = was ? toMoney(was) : null;
  }
  return map;
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;

  const route = await getProductDetail(slug);

  // A storefront that refused the read is not a product that does not exist,
  // and 404ing one would tell the shopper the opposite.
  //
  // Rendered rather than thrown. Next serves an uncaught throw on a direct hit
  // as an unstyled 21-byte "Internal Server Error" — measured, and true with
  // both an `error.tsx` and a `global-error.tsx` in place, because neither
  // boundary is mounted for a document render that never began. The cost of
  // rendering it is that ISR caches this page like any other, so a recovered
  // product can serve the apology for up to the 60s `revalidate` window before
  // the next background regeneration replaces it.
  if (route.unavailable) {
    return <ProductUnavailable />;
  }

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
  // No purchasable variant is a page that cannot render its buy box — same
  // 404 the selection guard produced when it lived here.
  if (variants.length === 0) notFound();

  const title = product.name;
  const vendor = product.brand?.name ?? null;
  // Rendered because `ProductJsonLd` emits `aggregateRating` from the same
  // call: Google's structured data policy is that markup describes what the
  // page shows, and a rating in the head with nothing in the body is the case
  // it names. Null for an unreviewed product, and then neither appears.
  //
  // Product-level, so it sits in the eyebrow rather than beside the price —
  // the price is inside `ProductSelection` and changes with the variant, and a
  // rating next to it would read as varying too.
  const rating = cardRating(product);
  // Product `type` is BigCommerce's Physical/Digital flag, not a merchandising
  // category — the seed carries that as a metafield.
  const category = keyMetafields(product.metafields.edges).product_type;

  const accordionSections = buildAccordionSections(product);
  const baseUrl = getBaseUrl();

  return (
    <>
      <ProductJsonLd
        description={product.plainTextDescription}
        handle={handle}
        product={product}
      />
      {/* Two crumbs, not three: the middle one linked `/collections`, which is
       * not this URL's parent. BigCommerce returns the real category chain but
       * not through this route's projection — see the category page's note. */}
      <BreadcrumbJsonLd
        items={[{ name: "Home", url: baseUrl }, { name: title }]}
      />
      <main className="site-container py-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)] xl:grid-cols-[minmax(0,1fr)_minmax(0,600px)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,760px)]">
          {/* Info column — sticky on desktop, uniform 32px rhythm */}
          <div className="flex min-w-0 max-w-2xl flex-col gap-8 self-start lg:sticky lg:top-24">
            {/* Season / brand eyebrow + rating + save */}
            <div className="flex items-start justify-between gap-4">
              {/* Always present, even when both children are absent, so the
               * save button stays pinned right without a placeholder span. */}
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                {vendor && (
                  <p className="text-muted-foreground text-sm">{vendor}</p>
                )}
                {rating && <RatingStars rating={rating} />}
              </div>
              {/* 44px hitbox passed from here, not baked into SavedItemButton:
               * on a ProductCard it sits absolutely over the product link, and
               * an invisible 44px box there would eat clicks meant for the
               * product. */}
              <SavedItemButton
                className="relative text-muted-foreground hover:text-foreground before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']"
                handle={handle}
              />
            </div>

            {/* Category + title + price, selectors, add to cart — the
             * `?Color=`-driven half, resolved on the client. The Suspense
             * fallback is the default variant's static twin, so the
             * prerendered HTML still carries title and price. */}
            <Suspense
              fallback={
                <div className="flex flex-col gap-2">
                  {category && (
                    <p className="text-muted-foreground text-sm">{category}</p>
                  )}
                  <h1 className="font-medium text-2xl tracking-tight lg:text-3xl">
                    {title}
                  </h1>
                  {variants[0] && (
                    <PriceDisplay
                      compareAtPrice={
                        compareAtByVariantId(product)[variants[0].id] ?? null
                      }
                      price={variants[0].price}
                    />
                  )}
                </div>
              }
            >
              <ProductSelection
                category={category}
                compareAtByVariantId={compareAtByVariantId(product)}
                handle={handle}
                options={options}
                productEntityId={product.entityId}
                title={title}
                variants={variants}
              />
            </Suspense>

            {/* Accordion — Description + metafields */}
            {accordionSections.length > 0 && (
              <ProductAccordion
                defaultOpenId="description"
                sections={accordionSections}
              />
            )}
          </div>

          {/* Gallery — vertical thumbnail rail + scrolling image column */}
          <Suspense
            fallback={
              <ProductGallery
                images={images}
                selectedVariantImageUrl={variants[0]?.image?.url}
              />
            }
          >
            <SelectedVariantGallery
              images={images}
              options={options}
              variants={variants}
            />
          </Suspense>
        </div>

        <RelatedProducts product={product} />
      </main>
    </>
  );
}
