import type { ImageLoaderProps } from "next/image";

const BIGCOMMERCE_CDN_HOST = "cdn11.bigcommerce.com";

/**
 * The sizing segment of a BigCommerce Stencil image path. Every CDN URL is
 * `/s-<hash>/images/stencil/<size>/products/...`, where `<size>` is `640w`,
 * `500x659` or `original` — the same slot `url(width: 640)` fills server-side.
 */
const STENCIL_SIZE = /(\/images\/stencil\/)[^/]+\//;

/**
 * Whether `src` is an absolute URL served by the BigCommerce CDN.
 *
 * Matches on the parsed hostname rather than a substring, so values that merely
 * mention the host — `https://example.com/?ref=cdn11.bigcommerce.com`, or a
 * lookalike like `cdn11.bigcommerce.com.example.com` — are correctly rejected.
 * Unparseable and relative values return `false`, which is what makes the
 * `new URL(src)` call in `resizeUrl` safe.
 *
 * Exact equality is deliberate: `next.config.ts` pins `remotePatterns` to this
 * one hostname, so a looser test would rewrite URLs Next would then refuse.
 */
export function isBigCommerceUrl(src: string): boolean {
  try {
    return new URL(src).hostname === BIGCOMMERCE_CDN_HOST;
  } catch {
    return false;
  }
}

/**
 * Rewrites a BigCommerce image URL to a different rendition.
 *
 * BigCommerce sizes in the path, not the query string: swapping the `<size>`
 * segment asks its CDN for that rendition, cached and free, instead of making
 * the Vercel optimizer download the master first. A URL whose path does not
 * carry the segment is returned untouched rather than guessed at.
 */
function resizeUrl(src: string, size: string): string {
  if (!isBigCommerceUrl(src)) return src;
  const url = new URL(src);
  url.pathname = url.pathname.replace(STENCIL_SIZE, `$1${size}/`);
  return url.toString();
}

/**
 * A custom `next/image` loader for BigCommerce CDN images. Next calls it once
 * per `deviceSizes` width, so the responsive `srcset` stays correct.
 *
 * There is no quality knob: BigCommerce's renditions are addressed by size
 * alone, and a `?quality=` parameter would only add a cache-busting query
 * string the CDN ignores. Non-BigCommerce URLs pass through untouched,
 * so the loader is safe to attach to any image.
 */
export function bigcommerceImageLoader({
  src,
  width,
}: ImageLoaderProps): string {
  return resizeUrl(src, `${width}w`);
}

/**
 * A tiny rendition of the same image, used as the `blurDataURL` for
 * `placeholder="blur"` — a blurry preview that sharpens as the full image
 * loads.
 */
export function bigcommerceBlurDataURL(src: string): string {
  return resizeUrl(src, "24w");
}
