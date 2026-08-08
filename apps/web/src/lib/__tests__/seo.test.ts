import { describe, expect, it, vi } from "vitest";

// Hoisted by vitest, so both run before `seo.ts` is evaluated. `getBaseUrl`
// reads env at call time and `@workspace/sanity/client` validates its own env
// at import time; neither is what these assertions are about.
vi.mock("@workspace/env/client", () => ({
  env: { NEXT_PUBLIC_VERCEL_ENV: "development" },
}));
vi.mock("@workspace/sanity/client", () => ({
  urlFor: () => ({ url: () => "" }),
}));

const { getSEOMetadata } = await import("@/lib/seo");

describe("getSEOMetadata robots", () => {
  it("honours the Studio's hide-from-search toggle", () => {
    // The half of `seoNoIndex` that lives in this repo's own code. The other
    // half — the field reaching here from `generateMetadata` — is wiring, and
    // was silently missing until ROB-2546's follow-up.
    expect(getSEOMetadata({ seoNoIndex: true }).robots).toBe(
      "noindex, nofollow"
    );
  });

  it("indexes by default, including when the field is absent", () => {
    expect(getSEOMetadata({ seoNoIndex: false }).robots).toBe("index, follow");
    expect(getSEOMetadata({}).robots).toBe("index, follow");
  });
});
