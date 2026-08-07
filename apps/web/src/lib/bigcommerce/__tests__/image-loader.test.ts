import { describe, expect, it } from "vitest";

import {
  bigcommerceBlurDataURL,
  bigcommerceImageLoader,
  isBigCommerceUrl,
} from "@/lib/bigcommerce/image-loader";
import imageOverride from "../__fixtures__/product-variant-image-override.json";

const product = imageOverride.response.data.site.multiColour;
const SRC = product.defaultImage.url;
const ORIGINAL = product.defaultImage.urlOriginal;

describe("isBigCommerceUrl", () => {
  it("matches the CDN host that next.config pins", () => {
    expect(isBigCommerceUrl(SRC)).toBe(true);
  });

  it("rejects lookalikes and relative values", () => {
    expect(isBigCommerceUrl("https://cdn11.bigcommerce.com.evil.test/a")).toBe(
      false
    );
    expect(isBigCommerceUrl("/local/image.png")).toBe(false);
  });
});

describe("bigcommerceImageLoader", () => {
  it("sizes on the stencil path segment, not a query string", () => {
    expect(SRC).toContain("/images/stencil/640w/");
    const out = bigcommerceImageLoader({ src: SRC, width: 1080, quality: 75 });
    expect(out).toBe(SRC.replace("/stencil/640w/", "/stencil/1080w/"));
    expect(out).not.toContain("?");
  });

  it("resizes the original rendition too", () => {
    expect(ORIGINAL).toContain("/images/stencil/original/");
    expect(bigcommerceImageLoader({ src: ORIGINAL, width: 320 })).toContain(
      "/images/stencil/320w/"
    );
  });

  it("leaves non-BigCommerce URLs untouched", () => {
    const src = "https://cdn.sanity.io/images/x/y.png";
    expect(bigcommerceImageLoader({ src, width: 800 })).toBe(src);
  });
});

describe("bigcommerceBlurDataURL", () => {
  it("asks the CDN for a tiny rendition", () => {
    expect(bigcommerceBlurDataURL(SRC)).toContain("/images/stencil/24w/");
  });
});
