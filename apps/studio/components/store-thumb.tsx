/**
 * A preview thumbnail for an image that lives on BigCommerce's CDN.
 *
 * Sanity's `media` renders a Sanity asset reference on its own, but synced
 * catalog documents store a plain URL — the sync deliberately does not
 * re-upload 132 product images into the dataset. So anything previewing a
 * product or category needs this.
 *
 * It lives in the Studio rather than in `@workspace/sanity-sync` because that
 * package is server-side and has no React dependency; giving it one so a list
 * row can show an `<img>` would be the wrong trade.
 */
export function storeThumb(url: unknown, alt: string) {
  if (typeof url !== "string" || !url) {
    return undefined;
  }

  return (
    <img
      alt={alt}
      src={url}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  );
}
