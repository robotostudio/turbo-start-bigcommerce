"use client";

import { cn } from "@workspace/ui/lib/utils";
import { ZoomIn } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import type { ShopifyImage } from "@/lib/shopify/types";
import { ProductLightbox } from "./product-lightbox";
import { ShopifyImage as ShopifyImageEl } from "./shopify-image";

type ProductGalleryProps = {
  images: ShopifyImage[];
  selectedVariantImageUrl?: string;
};

/**
 * Desktop gallery: a vertical sticky thumbnail rail + a stacked, page-scrolling
 * image column. The active thumbnail follows scroll via IntersectionObserver;
 * clicking a thumb (or changing the variant) scrolls to the matching image.
 */
type GalleryViewProps = ProductGalleryProps & {
  onOpenLightbox: (index: number) => void;
  registerSource: (index: number, el: HTMLButtonElement | null) => void;
};

function GalleryDesktop({
  images,
  selectedVariantImageUrl,
  onOpenLightbox,
  registerSource,
}: GalleryViewProps) {
  const [active, setActive] = useState(0);
  const imageRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const prevVariantUrl = useRef(selectedVariantImageUrl);
  // Programmatic smooth scroll is the biggest vestibular trigger here — this
  // rail can travel several viewport heights on one thumbnail click, and there
  // is no "gentler" version of that. Jump instead.
  const reduced = usePrefersReducedMotion();
  const behavior: ScrollBehavior = reduced ? "auto" : "smooth";

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const index = Number(
              (entry.target as HTMLElement).dataset.index ?? 0
            );
            setActive(index);
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    );

    for (const el of imageRefs.current) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  const scrollToIndex = (index: number) => {
    imageRefs.current[index]?.scrollIntoView({
      behavior,
      block: "start",
    });
  };

  // Scroll to the variant's image when the selected variant changes.
  useEffect(() => {
    if (!selectedVariantImageUrl) return;
    if (selectedVariantImageUrl === prevVariantUrl.current) return;
    prevVariantUrl.current = selectedVariantImageUrl;

    const index = images.findIndex(
      (img) => img.url === selectedVariantImageUrl
    );
    if (index >= 0) {
      imageRefs.current[index]?.scrollIntoView({
        behavior,
        block: "start",
      });
    }
  }, [selectedVariantImageUrl, images, behavior]);

  return (
    <div className="hidden lg:flex lg:gap-1">
      {images.length > 1 && (
        <div className="sticky top-24 flex h-fit flex-col gap-1 self-start">
          {images.map((image, index) => (
            <button
              className={cn(
                "w-[54px] shrink-0 border transition-colors",
                active === index
                  ? "border-foreground"
                  : "border-transparent hover:border-muted-foreground/40"
              )}
              key={image.url}
              onClick={() => scrollToIndex(index)}
              type="button"
            >
              <div className="card-surface relative aspect-3/4 w-full overflow-hidden">
                <ShopifyImageEl
                  alt={image.altText ?? `Thumbnail ${index + 1}`}
                  className="object-cover"
                  fill
                  sizes="54px"
                  src={image.url}
                />
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 space-y-4">
        {images.map((image, index) => (
          <button
            className="group card-surface relative block aspect-3/4 w-full cursor-zoom-in overflow-hidden scroll-mt-24"
            data-index={index}
            key={image.url}
            onClick={() => onOpenLightbox(index)}
            ref={(el) => {
              imageRefs.current[index] = el;
              registerSource(index, el);
            }}
            type="button"
          >
            <ShopifyImageEl
              alt={image.altText ?? "Product image"}
              className="object-cover"
              fill
              priority={index === 0}
              sizes="(min-width: 1024px) 55vw, 100vw"
              src={image.url}
            />
            <span className="absolute top-3 right-3 bg-black/50 p-2 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <ZoomIn className="size-4" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Mobile gallery: a horizontal CSS scroll-snap carousel with a
 * justify-center-safe thumbnail row (centers when few, left-aligns when
 * overflowing — no JS overflow detection).
 */
function GalleryMobile({
  images,
  selectedVariantImageUrl,
  onOpenLightbox,
  registerSource,
}: GalleryViewProps) {
  const [active, setActive] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const prevVariantUrl = useRef(selectedVariantImageUrl);
  const reduced = usePrefersReducedMotion();
  const behavior: ScrollBehavior = reduced ? "auto" : "smooth";

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const index = Number(
              (entry.target as HTMLElement).dataset.index ?? 0
            );
            setActive(index);
          }
        }
      },
      { root, threshold: 0.6 }
    );

    for (const el of slideRefs.current) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  const scrollToIndex = (index: number) => {
    slideRefs.current[index]?.scrollIntoView({
      behavior,
      block: "nearest",
      inline: "center",
    });
  };

  useEffect(() => {
    if (!selectedVariantImageUrl) return;
    if (selectedVariantImageUrl === prevVariantUrl.current) return;
    prevVariantUrl.current = selectedVariantImageUrl;

    const index = images.findIndex(
      (img) => img.url === selectedVariantImageUrl
    );
    if (index >= 0) {
      slideRefs.current[index]?.scrollIntoView({
        behavior,
        block: "nearest",
        inline: "center",
      });
    }
  }, [selectedVariantImageUrl, images, behavior]);

  return (
    /* min-w-0: as a grid item this defaults to `min-width: auto`, so the thumb
     * row below (7 fixed-width thumbs, wider than a phone) sets a min-content
     * floor that widens the whole PDP column past the viewport. */
    <div className="min-w-0 lg:hidden">
      <div
        className="flex snap-x snap-mandatory overflow-x-auto"
        ref={scrollerRef}
      >
        {images.map((image, index) => (
          <button
            className="card-surface relative aspect-3/4 w-full shrink-0 basis-full snap-center overflow-hidden"
            data-index={index}
            key={image.url}
            onClick={() => onOpenLightbox(index)}
            ref={(el) => {
              slideRefs.current[index] = el;
              registerSource(index, el);
            }}
            type="button"
          >
            <ShopifyImageEl
              alt={image.altText ?? "Product image"}
              className="object-cover"
              fill
              priority={index === 0}
              sizes="100vw"
              src={image.url}
            />
          </button>
        ))}
      </div>

      {images.length > 1 && (
        <div className="mt-3 flex justify-center-safe gap-2 overflow-x-auto">
          {images.map((image, index) => (
            <button
              className={cn(
                "shrink-0 border-b pb-1 transition-colors",
                active === index ? "border-foreground" : "border-transparent"
              )}
              key={image.url}
              onClick={() => scrollToIndex(index)}
              type="button"
            >
              <div className="card-surface relative h-16 w-12 overflow-hidden">
                <ShopifyImageEl
                  alt={image.altText ?? `Thumbnail ${index + 1}`}
                  className="object-cover"
                  fill
                  sizes="48px"
                  src={image.url}
                />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProductGallery({
  images,
  selectedVariantImageUrl,
}: ProductGalleryProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  // Source rect captured at click time — reliable, unlike resolving it later.
  const [sourceRect, setSourceRect] = useState<DOMRect | null>(null);
  // Likewise for the source URL. Tagged with the index it was captured for so
  // arrow navigation inside the lightbox can't render a stale image's URL.
  const [sourceSrc, setSourceSrc] = useState<{
    index: number;
    src: string;
  } | null>(null);

  // On-page image elements per `${view}:${index}`, so the lightbox can zoom
  // out of / back into whichever view is currently visible.
  const sourceEls = useRef(new Map<string, HTMLButtonElement>());
  const setSource =
    (view: "d" | "m") => (index: number, el: HTMLButtonElement | null) => {
      const key = `${view}:${index}`;
      if (el) sourceEls.current.set(key, el);
      else sourceEls.current.delete(key);
    };
  const getSourceRect = (index: number): DOMRect | null => {
    for (const view of ["d", "m"] as const) {
      const el = sourceEls.current.get(`${view}:${index}`);
      if (el && el.offsetParent !== null) return el.getBoundingClientRect();
    }
    return null;
  };

  // The optimized URL the visible on-page `next/image` already downloaded, so
  // the lightbox can reuse that cached resource instead of fetching the raw
  // Shopify master on open. `null` when no view has it loaded (falls back to
  // the raw URL in the lightbox).
  const getSourceSrc = (index: number): string | null => {
    for (const view of ["d", "m"] as const) {
      const el = sourceEls.current.get(`${view}:${index}`);
      if (el && el.offsetParent !== null) {
        return el.querySelector("img")?.currentSrc || null;
      }
    }
    return null;
  };

  if (images.length === 0) {
    return <div className="card-surface aspect-3/4 w-full" />;
  }

  const openLightbox = (index: number) => {
    const src = getSourceSrc(index);
    setSourceRect(getSourceRect(index));
    setSourceSrc(src ? { index, src } : null);
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  return (
    <>
      <GalleryDesktop
        images={images}
        onOpenLightbox={openLightbox}
        registerSource={setSource("d")}
        selectedVariantImageUrl={selectedVariantImageUrl}
      />
      <GalleryMobile
        images={images}
        onOpenLightbox={openLightbox}
        registerSource={setSource("m")}
        selectedVariantImageUrl={selectedVariantImageUrl}
      />
      <ProductLightbox
        getSourceRect={getSourceRect}
        getSourceSrc={getSourceSrc}
        images={images}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onOpenChange={setLightboxOpen}
        open={lightboxOpen}
        sourceRect={sourceRect}
        sourceSrc={sourceSrc}
      />
    </>
  );
}
