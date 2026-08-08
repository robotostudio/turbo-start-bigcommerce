import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { ActiveFilters } from "@/components/collection/active-filters";
import { CollectionProducts } from "@/components/collection/collection-products";
import { FilterPanel } from "@/components/collection/filter-panel";
import { ProductGrid } from "@/components/collection/product-grid";
import {
  ListingControls,
  ListingControlsProvider,
} from "@/components/collection/listing-controls";
import { BreadcrumbJsonLd, CollectionJsonLd } from "@/components/json-ld";
import {
  getCategoryByPath,
  getCategoryPaths,
  prerenderLimit,
  resolveSeo,
  toSegments,
} from "@/lib/bigcommerce/catalog";
import { searchCatalog } from "@/lib/bigcommerce/search";
import { fetchOrFallback } from "@/lib/build-guard";
import { getSEOMetadata } from "@/lib/seo";
import { getBaseUrl } from "@/utils";

/**
 * No `searchParams` here, deliberately: awaiting it opts the route out of
 * static generation. Sort, filters and grid density are URL state read by the
 * client components (`SortSelector`, `CollectionProducts`) via
 * `useSearchParams`; the category read keys on the path alone.
 */
type PageProps = {
  params: Promise<{ slug: string[] }>;
};

/**
 * Same reason as the PDP — the catalog read is a POST, so page-level ISR is the
 * only thing that stops a prerendered category serving its build-time prices and
 * product set forever.
 *
 * Five minutes, longer than the PDP's minute, because a category is a browse
 * surface rather than a commit point: a stale card costs a shopper far less than
 * a stale price on the page they buy from, and there are many more category
 * pages, so the regeneration bill scales with this number.
 */
export const revalidate = 300;

const PAGE_SIZE = 12;

/** BigCommerce category descriptions are rich text; SEO wants prose. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Catch-all, not `[handle]`: BigCommerce category paths are multi-segment by
 * default, so `/collections/jackets/leather` is one category, not a category
 * and a stray segment.
 */
export async function generateStaticParams() {
  const paths = await fetchOrFallback(
    "BigCommerce category paths",
    "category pages render on demand instead of being prerendered",
    () => getCategoryPaths().then((r) => (r.ok ? r.data : [])),
    []
  );
  // The tree arrives whole, so unlike products there is nothing to page — but
  // the same cap applies, so a big catalog's build stays bounded on both routes.
  return paths.slice(0, prerenderLimit()).map((path) => ({
    slug: toSegments(path),
  }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  // Metadata needs the category, never its products — and BigCommerce charges
  // complexity on what a query executes, so leaving them out is 1022 instead of
  // 4697 on every category page built.
  const result = await getCategoryByPath(slug, { withProducts: false });
  if (!(result.ok && result.data.node)) return {};

  const category = result.data.node;
  const seo = resolveSeo(category.seo, {
    title: category.name,
    description: stripHtml(category.description),
  });

  return getSEOMetadata({
    title: seo.title,
    description: seo.description,
    slug: `/collections/${slug.join("/")}`,
  });
}

export default async function CollectionPage({ params }: PageProps) {
  const { slug } = await params;

  // Two hops, and they cannot be one: `searchProducts` scopes to a category by
  // entity id, and a URL only carries the path. So the route resolves the path
  // to a category first — without a page of products attached, which is what
  // `withProducts: false` buys — and the listing read follows.
  //
  // This runs at build and revalidation time rather than per request (see
  // `generateStaticParams` and `revalidate` above), and "Load more" pays
  // nothing extra: the id resolved here is forwarded to the client.
  const result = await getCategoryByPath(slug, { withProducts: false });
  if (!result.ok) notFound();

  // A renamed category keeps working: BigCommerce auto-creates the 301 and
  // `redirectBehavior: FOLLOW` hands back its canonical URL.
  if (result.data.redirectTo) redirect(result.data.redirectTo);

  // Catalog-required and Sanity-free. There is no editorial document behind a
  // category, so a category that resolves is a page that renders — the newest
  // one in the catalog is browsable the moment it is created.
  if (!result.data.node) notFound();

  const category = result.data.node;
  const handle = slug.join("/");
  const baseUrl = getBaseUrl();

  // Facets and the plan flag ride along with the products rather than costing a
  // second read: `searchProducts` returns them beside the results it filtered.
  const listing = await searchCatalog({
    categoryEntityId: category.entityId,
    first: PAGE_SIZE,
  });
  const products = listing.ok ? listing.data.products : [];
  const pageInfo = listing.ok
    ? listing.data.pageInfo
    : { hasNextPage: false, endCursor: null };
  // Degrades to false if the read failed, which keeps the panel's message
  // honest rather than promising filters nothing can supply.
  const filteringEnabled = listing.ok ? listing.data.filteringEnabled : false;
  const facets = listing.ok ? listing.data.facets : [];

  return (
    <div className="site-container py-8">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: baseUrl },
          { name: "Collections", url: `${baseUrl}/collections` },
          // `category.name`, not `breadcrumbs`: spreading `CategoryDetail` as a
          // named fragment on `site.route(...).node` drops the breadcrumbs
          // connection outright — same defect that empties `productOptions` on
          // the PDP, verified live. Nothing here needs the ancestor chain.
          { name: category.name },
        ]}
      />
      <CollectionJsonLd
        description={stripHtml(category.description)}
        items={products.map((product) => ({
          name: product.name,
          url: `${baseUrl}${product.path}`,
        }))}
        name={category.name}
        url={`${baseUrl}/collections/${handle}`}
      />
      <ListingControlsProvider>
        <div className="flex items-start justify-between gap-4">
          <h1 className="min-w-0 text-balance font-medium text-2xl tracking-tight md:text-[32px]">
            {category.name}
          </h1>
          <ListingControls />
        </div>

        {/* `useSearchParams` consumers need Suspense boundaries on a
         * statically generated route; each fallback is the default view the
         * server already rendered, so nothing jumps on hydration. */}
        <div className="mb-8 flex flex-col gap-4">
          {/* Both empty on a plan without Product Filtering, which is what the
           * panel's "unavailable" state is for. Passed through rather than
           * derived: the same read that returned these products returned the
           * facets that describe them. */}
          <Suspense fallback={null}>
            <FilterPanel filteringEnabled={filteringEnabled} filters={facets} />
          </Suspense>
          <Suspense fallback={null}>
            <ActiveFilters facets={facets} />
          </Suspense>
        </div>

        <Suspense
          fallback={<ProductGrid density="comfortable" products={products} />}
        >
          <CollectionProducts
            categoryEntityId={category.entityId}
            handle={handle}
            initialPageInfo={pageInfo}
            initialProducts={products}
          />
        </Suspense>
      </ListingControlsProvider>
    </div>
  );
}
