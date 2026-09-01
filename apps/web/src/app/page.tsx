import { sanityFetch } from "@workspace/sanity/live";
import { queryHomePageData } from "@workspace/sanity/query";
import { Button } from "@workspace/ui/components/button";
import Link from "next/link";

import { PageBuilderJsonLd } from "@/components/page-builder-json-ld";
import { PageBuilder } from "@/components/pagebuilder";
import { pageBuilderSeeds } from "@/components/pagebuilder-data.server";
import { seoFromDocument } from "@/lib/seo";

async function fetchHomePageData() {
  return await sanityFetch({
    query: queryHomePageData,
  });
}

export async function generateMetadata() {
  const { data: homePageData } = await fetchHomePageData();
  return seoFromDocument(homePageData, { slug: "/" });
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

  // The catalog reads start here without being awaited — each product-backed
  // block suspends on its own entry inside PageBuilder, and the prerendered
  // build waits for every boundary before shipping HTML.
  const blockData = pageBuilderSeeds(pageBuilder ?? []);

  // One PageBuilder over the whole array: two instances shared the document id,
  // so each reducer saw only its own slice and a drag across them moved nothing.
  return (
    <main>
      <PageBuilderJsonLd pageBuilder={pageBuilder} />
      <PageBuilder
        blockData={blockData}
        id={_id}
        pageBuilder={pageBuilder ?? []}
        type={_type}
      />
    </main>
  );
}
