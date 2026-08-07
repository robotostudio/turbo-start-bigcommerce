import { SearchModal } from "@/components/search/search-modal";

type PageProps = {
  searchParams: Promise<Record<string, string>>;
};

export default async function SearchModalPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  return <SearchModal initialQuery={sp.q?.trim() ?? ""} />;
}
