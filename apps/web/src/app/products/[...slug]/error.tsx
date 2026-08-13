"use client";

import { ProductUnavailable } from "@/components/product/product-unavailable";

/**
 * The boundary for anything this route throws that the page did not expect — a
 * bug, rather than the storefront refusing the read, which the page renders
 * itself.
 *
 * It does not catch a direct hit: a document render that throws before it
 * begins is served as a plain 500, measured, with `global-error.tsx` in place
 * as well. That is the right loudness for a bug, and this is what is left for
 * the renders that do have a boundary mounted.
 */
export default function ProductError() {
  return <ProductUnavailable />;
}
