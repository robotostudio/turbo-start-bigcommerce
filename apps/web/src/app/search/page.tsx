import { SearchPageContent } from "@/components/search/search-page-content";
import { getSEOMetadata } from "@/lib/seo";

export function generateMetadata() {
  return getSEOMetadata({
    title: "Search",
    description: "Search our products",
    slug: "/search",
    seoNoIndex: true,
  });
}

type PageProps = {
  searchParams: Promise<Record<string, string>>;
};

export default async function SearchPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const query = sp.q?.trim() ?? "";

  return (
    <main className="site-container flex w-full flex-col py-12 md:py-20">
      {/* The design has no visible heading here — the input is the page. But
       * this was the one route left without an `h1`, so its outline claimed
       * the page was about "Best Sellers", the first `h2` on it. Hidden
       * rather than drawn, matching the `sr-only` headings already used in
       * `blog-page-content.tsx`. */}
      <h1 className="sr-only">Search</h1>
      <SearchPageContent initialQuery={query} />
    </main>
  );
}
