import { CartPageContent } from "@/components/cart/cart-page-content";
import { getSEOMetadata } from "@/lib/seo";

export function generateMetadata() {
  // The body moved to `CartPageContent` because a `"use client"` page cannot
  // export `generateMetadata`, so this route shipped with no metadata at all.
  return getSEOMetadata({
    title: "Cart",
    description: "Review the items in your cart before checkout.",
    slug: "/cart",
    seoNoIndex: true,
  });
}

export default function CartPage() {
  return <CartPageContent />;
}
