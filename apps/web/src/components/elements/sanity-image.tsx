"use client";
import {
  processImageData,
  SANITY_BASE_URL,
  type SanityImageProps,
} from "@workspace/sanity/image";
import { type ElementType, memo } from "react";
import {
  SanityImage as BaseSanityImage,
  type WrapperProps,
} from "sanity-image";

// Image wrapper component
const ImageWrapper = <T extends ElementType = "img">(
  props: WrapperProps<T>
) => <BaseSanityImage baseUrl={SANITY_BASE_URL} {...props} />;

/**
 * `sanity-image` parks the real `<img>` behind the LQIP until its own `onLoad`
 * flips a state hook — a 10px, `opacity: 0` ghost at `z-index: -10`. With
 * JavaScript off that handler never runs, so every image on the site stays a
 * blurred base64 smear for good, the hero included.
 *
 * The library spreads a caller `style` *over* that hiding style and React drops
 * any property whose value is `undefined`, so handing these back as undefined
 * erases the rule and lets the `className` size the image as it does once
 * loaded. The blur-up survives for everyone else: the LQIP still renders
 * underneath and is still dropped on load — it just no longer gates the real
 * image, which now paints over it the way `next/image` does.
 */
const SHOW_BEFORE_LOAD = {
  height: undefined,
  width: undefined,
  position: undefined,
  zIndex: undefined,
  opacity: undefined,
  pointerEvents: undefined,
  userSelect: undefined,
} as const;

// Main component
function SanityImageUnmemorized({ image, style, ...props }: SanityImageProps) {
  const processedImageData = processImageData(image);

  // Early return for invalid image data
  if (!processedImageData) {
    return null;
  }

  return (
    <ImageWrapper
      {...props}
      {...processedImageData}
      style={{ ...SHOW_BEFORE_LOAD, ...style }}
    />
  );
}

export const SanityImage = memo(SanityImageUnmemorized);
