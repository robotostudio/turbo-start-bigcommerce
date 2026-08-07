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
    <div className="site-container flex w-full flex-col py-12 md:py-20">
      <SearchPageContent initialQuery={query} />
    </div>
  );
}
