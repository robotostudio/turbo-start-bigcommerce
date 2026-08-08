"use client";

import Image, { type ImageProps } from "next/image";

import {
  bigcommerceBlurDataURL,
  bigcommerceImageLoader,
  isBigCommerceUrl,
} from "@/lib/bigcommerce/image-loader";

/**
 * `next/image` wrapper for BigCommerce CDN images. Applies the BigCommerce
 * loader (so the CDN serves the rendition instead of the Vercel optimizer
 * downloading masters) and a blur-up placeholder by default. Non-BigCommerce
 * `src` values fall through to the default optimizer and whatever placeholder
 * the caller passed.
 */
export function StoreImage({
  src,
  placeholder,
  blurDataURL,
  ...props
}: ImageProps) {
  // Share one predicate with the loader. If this said "BigCommerce" and the
  // loader disagreed, the loader would return every `srcset` URL untouched and
  // all resizing would silently stop.
  const isStore = typeof src === "string" && isBigCommerceUrl(src);

  return (
    <Image
      blurDataURL={isStore ? bigcommerceBlurDataURL(src) : blurDataURL}
      loader={isStore ? bigcommerceImageLoader : undefined}
      placeholder={isStore ? "blur" : placeholder}
      src={src}
      {...props}
    />
  );
}
