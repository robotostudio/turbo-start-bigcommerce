import { sanityFetch } from "@workspace/sanity/live";
import { queryHomePageData } from "@workspace/sanity/query";
import { Button } from "@workspace/ui/components/button";
import Link from "next/link";

import { PageBuilder } from "@/components/pagebuilder";
import { getSEOMetadata } from "@/lib/seo";

async function fetchHomePageData() {
  return await sanityFetch({
    query: queryHomePageData,
  });
}

export async function generateMetadata() {
  const { data: homePageData } = await fetchHomePageData();
  return getSEOMetadata(
    homePageData
      ? {
          title: homePageData?.title ?? homePageData?.seoTitle ?? "",
          description:
            homePageData?.description ?? homePageData?.seoDescription ?? "",
          slug: homePageData?.slug,
          contentId: homePageData?._id,
          contentType: homePageData?._type,
        }
      : {}
  );
}

export default async function Page() {
  const { data: homePageData } = await fetchHomePageData();

  // `sanityFetch` degrades an unreachable Content Lake to `data: null`, which
  // is the house pattern — but the string this used to render ("No home page
  // data") sat unstyled between a working navbar and a skeleton footer, and
  // read as an unfinished build rather than as a service that did not answer.
  if (!homePageData) {
    return (
      <div className="site-container flex min-h-[60vh] flex-col items-center justify-center gap-4 py-16 text-center">
        <h1 className="font-light text-3xl tracking-tight md:text-4xl">
          This page couldn&apos;t be loaded
        </h1>
        <p className="max-w-prose text-muted-foreground text-sm tracking-wide">
          Our content service didn&apos;t answer just now. The shop is still
          open.
        </p>
        <Button asChild className="mt-4 uppercase tracking-wider" size="lg">
          <Link href="/collections">Back to Shop</Link>
        </Button>
      </div>
    );
  }

  const { _id, _type, pageBuilder } = homePageData ?? {};

  // One PageBuilder over the whole array. Splitting the hero into a second
  // instance gave both the same document id, so each optimistic reducer only
  // saw its own slice and a drag across the boundary never moved anything.
  return <PageBuilder id={_id} pageBuilder={pageBuilder ?? []} type={_type} />;
}
