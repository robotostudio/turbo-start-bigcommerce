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
  nodes,
  prerenderLimit,
  resolveSeo,
  toSegments,
} from "@/lib/bigcommerce/catalog";
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
  const result = await getCategoryByPath(slug, { first: 1 });
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

  const result = await getCategoryByPath(slug, { first: PAGE_SIZE });
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
  const products = nodes(category.products);
  const baseUrl = getBaseUrl();

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

        <div className="mb-8 flex flex-col gap-4">
          <FilterPanel filters={[]} />
          {/* `useSearchParams` consumers need Suspense boundaries on a
           * statically generated route; each fallback is the default view the
           * server already rendered, so nothing jumps on hydration. */}
          <Suspense fallback={null}>
            <ActiveFilters />
          </Suspense>
        </div>

        <Suspense
          fallback={<ProductGrid density="comfortable" products={products} />}
        >
          <CollectionProducts
            handle={handle}
            initialPageInfo={category.products.pageInfo}
            initialProducts={products}
          />
        </Suspense>
      </ListingControlsProvider>
    </div>
  );
}
