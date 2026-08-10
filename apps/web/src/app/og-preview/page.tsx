/** biome-ignore-all lint/performance/noImgElement: internal QA preview, not user-facing */
import { sanityFetch } from "@workspace/sanity/live";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  flattenCategoryTree,
  getCategoryTree,
  getProductSummaries,
  toSegments,
} from "@/lib/bigcommerce/catalog";

export const metadata: Metadata = {
  title: "OG Image Preview",
  robots: "noindex, nofollow",
};

// Always render against the latest content when opened.
export const dynamic = "force-dynamic";

type Doc = { _id: string; title: string | null };

type Content = {
  home: { _id: string } | null;
  pages: Doc[];
  blogs: Doc[];
};

// Cap the number of product previews so the page stays light (each card renders
// a full OG image). Raise or remove once the layout is signed off.
const PRODUCT_PREVIEW_LIMIT = 10;

// Editorial content only. Products and categories are enumerated from
// BigCommerce, keyed exactly as each page's own metadata keys them — the id for
// a product, the path segments for a category — so a card that renders here is
// the card a crawler gets.
const CONTENT_QUERY = /* groq */ `{
  "home": *[_type == "homePage"][0]{ _id },
  "pages": *[_type == "page" && defined(slug.current)] | order(_createdAt desc){
    _id, "title": coalesce(title, slug.current)
  },
  "blogs": *[_type == "blog" && defined(slug.current)] | order(_createdAt desc){
    _id, "title": coalesce(title, slug.current)
  }
}`;

function ogUrl(params: Record<string, string | number>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    search.set(key, String(value));
  }
  return `/api/og?${search.toString()}`;
}

type Card = { id: string; title: string; url: string };
type Section = { heading: string; cards: Card[] };

export default async function OgPreviewPage() {
  // QA-only gallery — it enumerates content and renders many OG images, so keep
  // it out of production entirely (the noindex metadata alone isn't a gate).
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const [{ data: content }, productsResult, categoryTree] = await Promise.all([
    // `CONTENT_QUERY` is local to this page, so it is not in the generated
    // query map and the wrapper cannot type it — hence the cast. It goes
    // through the wrapper anyway: one read path for every Sanity call, and an
    // unreachable Content Lake leaves the catalog sections rendering.
    sanityFetch({ query: CONTENT_QUERY }) as Promise<{ data: Content | null }>,
    getProductSummaries(PRODUCT_PREVIEW_LIMIT),
    getCategoryTree(),
  ]);
  const products = productsResult.ok ? productsResult.data : [];
  const categories = categoryTree.ok
    ? flattenCategoryTree(categoryTree.data)
    : [];

  const sections: Section[] = [];

  if (content?.home) {
    sections.push({
      heading: "Home",
      cards: [
        {
          id: content.home._id,
          title: "Home page",
          url: ogUrl({ type: "homePage", id: content.home._id }),
        },
      ],
    });
  }

  const simple: { key: string; heading: string; type: string; docs: Doc[] }[] =
    [
      {
        key: "pages",
        heading: "Pages",
        type: "page",
        docs: content?.pages ?? [],
      },
      {
        key: "blogs",
        heading: "Blog posts",
        type: "blog",
        docs: content?.blogs ?? [],
      },
    ];

  for (const group of simple) {
    if (group.docs.length === 0) continue;
    sections.push({
      heading: `${group.heading} (${group.docs.length})`,
      cards: group.docs.map((doc) => ({
        id: doc._id,
        title: doc.title ?? doc._id,
        url: ogUrl({ type: group.type, id: doc._id }),
      })),
    });
  }

  if (categories.length > 0) {
    sections.push({
      heading: `Collections (${categories.length})`,
      cards: categories.map((category) => ({
        id: String(category.entityId),
        title: category.name,
        url: ogUrl({
          type: "collection",
          id: toSegments(category.path).join("/"),
        }),
      })),
    });
  }

  if (products.length > 0) {
    sections.push({
      // The cap is a request size, not a catalog count — there is no cheap
      // total to compare it against, so the heading does not claim one.
      heading:
        products.length === PRODUCT_PREVIEW_LIMIT
          ? `Products (first ${PRODUCT_PREVIEW_LIMIT})`
          : `Products (${products.length})`,
      cards: products.map((product) => ({
        id: String(product.entityId),
        title: product.name,
        url: ogUrl({ type: "product", id: product.entityId }),
      })),
    });
  }

  const total = sections.reduce((n, s) => n + s.cards.length, 0);

  return (
    <main className="px-4 py-12 lg:px-8">
      <header className="mb-10 flex flex-col gap-2">
        <h1 className="font-medium text-3xl tracking-tight">
          OG Image Preview
        </h1>
        <p className="max-w-2xl text-muted-foreground text-sm">
          {total} live Open Graph images across the site, rendered from{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            /api/og
          </code>{" "}
          at 1200×630 — the exact links used by each page's metadata. Products
          include live BigCommerce price, discount, colors, and image.
        </p>
      </header>

      {total === 0 ? (
        <p className="text-muted-foreground text-sm">
          No content found in this dataset.
        </p>
      ) : (
        <div className="flex flex-col gap-12">
          {sections.map((section) => (
            <section className="flex flex-col gap-5" key={section.heading}>
              <h2 className="font-medium text-lg">{section.heading}</h2>
              <div className="grid gap-8 sm:grid-cols-2">
                {section.cards.map((card) => (
                  <figure className="flex flex-col gap-3" key={card.id}>
                    <a
                      className="block overflow-hidden rounded-lg border bg-muted transition-opacity hover:opacity-90"
                      href={card.url}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <img
                        alt={`${card.title} Open Graph preview`}
                        className="aspect-1200/630 w-full object-cover"
                        height={630}
                        loading="lazy"
                        src={card.url}
                        width={1200}
                      />
                    </a>
                    <figcaption className="flex flex-col gap-1">
                      <span className="font-medium text-sm">{card.title}</span>
                      <a
                        className="truncate text-muted-foreground text-xs hover:text-foreground hover:underline"
                        href={card.url}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {card.url}
                      </a>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
