import { stegaClean } from "next-sanity";

import { FaqJsonLd } from "@/components/json-ld";
import type { PageBuilderBlock } from "@/components/pagebuilder-reducer";
import type { PagebuilderType } from "@/types";

/**
 * Structured data for the page-builder array, emitted on the server.
 *
 * Hoisted out of the block components, which each rendered their own
 * `<FaqJsonLd>` hard-coded to `id="faq-json-ld"` — two FAQ blocks on one page
 * shipped two `FAQPage` scripts sharing a DOM id. Keying on `_key` fixes that,
 * and keeps the markup out of the browser bundle (`faq-categories.tsx` is
 * `"use client"`).
 */
export function PageBuilderJsonLd({
  pageBuilder,
}: Readonly<{ pageBuilder?: PageBuilderBlock[] | null }>) {
  if (!pageBuilder?.length) {
    return null;
  }

  return (
    <>
      {pageBuilder.map((block) => {
        if (block?._type === "faqAccordion") {
          const { faqs } = stegaClean(block as PagebuilderType<"faqAccordion">);
          return (
            <FaqJsonLd
              faqs={faqs ?? []}
              id={`faq-json-ld-${block._key}`}
              key={`faq-json-ld-${block._key}`}
            />
          );
        }

        if (block?._type === "faqCategories") {
          const { categories } = stegaClean(
            block as PagebuilderType<"faqCategories">
          );
          // One FAQPage per block, not per category: the categories are a
          // presentation grouping, and schema.org has no nesting for them.
          const faqs = (categories ?? []).flatMap(
            (category) => category?.faqs ?? []
          );
          return (
            <FaqJsonLd
              faqs={faqs}
              id={`faq-json-ld-${block._key}`}
              key={`faq-json-ld-${block._key}`}
            />
          );
        }

        return null;
      })}
    </>
  );
}
