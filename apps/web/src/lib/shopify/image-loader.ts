import type { ImageLoaderProps } from "next/image";

const SHOPIFY_CDN_HOST = "cdn.shopify.com";

/**
 * Whether `src` is an absolute URL served by the Shopify CDN.
 *
 * Matches on the parsed hostname rather than a substring, so values that merely
 * mention the host — `https://example.com/?ref=cdn.shopify.com`, or a lookalike
 * like `cdn.shopify.com.example.com` — are correctly rejected. Unparseable and
 * relative values return `false`, which is what makes the `new URL(src)` calls
 * in the transforms below safe.
 *
 * Exact equality is deliberate: `next.config.ts` pins `remotePatterns` to this
 * one hostname, so a looser test would rewrite URLs Next would then refuse.
 */
export function isShopifyUrl(src: string): boolean {
  try {
    return new URL(src).hostname === SHOPIFY_CDN_HOST;
  } catch {
    return false;
  }
}

/**
 * A custom `next/image` loader for Shopify CDN images.
 *
 * Shopify's CDN resizes and reformats images on the fly via URL params
 * (`?width=`, `&height=`, `&crop=`). By mapping Next's requested width onto
 * Shopify's `width` param we let Shopify's global CDN do the resizing — fast,
 * cached, and free — instead of forcing the Vercel optimizer to first download
 * the full-resolution master. Next still calls this once per `deviceSizes`
 * width, so we keep a correct responsive `srcset`.
 *
 * Non-Shopify URLs are returned untouched so this loader is safe to attach to
 * any image.
 */
export function shopifyImageLoader({
  src,
  width,
  quality,
}: ImageLoaderProps): string {
  if (!isShopifyUrl(src)) {
    return src;
  }

  const url = new URL(src);
  url.searchParams.set("width", String(width));
  url.searchParams.set("quality", String(quality ?? 75));
  return url.toString();
}

/**
 * A bounded Shopify variant sized for the fullscreen lightbox. Used only when
 * the lightbox can't reuse the resource the on-page gallery already downloaded
 * (e.g. an arrow-navigated image that was still lazy). Bare Shopify `url`
 * values are the untransformed master — often several MB — so never hand one
 * straight to an `<img>`.
 */
export function shopifyFullscreenURL(src: string): string {
  if (!isShopifyUrl(src)) {
    return src;
  }

  const url = new URL(src);
  url.searchParams.set("width", "2048");
  url.searchParams.set("quality", "85");
  return url.toString();
}

/**
 * A tiny, low-quality Shopify variant of the same image, used as the
 * `blurDataURL` for `placeholder="blur"`. This renders a blurry preview
 * instantly and sharpens to the full image as it loads (the "blur-up" effect).
 * Returns the original `src` unchanged for non-Shopify URLs.
 */
export function shopifyBlurDataURL(src: string): string {
  if (!isShopifyUrl(src)) {
    return src;
  }

  const url = new URL(src);
  url.searchParams.set("width", "24");
  url.searchParams.set("quality", "30");
  return url.toString();
}
