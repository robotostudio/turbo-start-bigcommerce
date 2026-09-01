import { describe, expect, it, vi } from "vitest";

// Hoisted by vitest, so all three run before `seo.ts` is evaluated. Env
// validation and the Content Lake read are not what these assertions are about.
vi.mock("@workspace/env/client", () => ({
  env: { NEXT_PUBLIC_VERCEL_ENV: "development" },
}));
vi.mock("@workspace/sanity/client", () => ({
  urlFor: () => ({ url: () => "" }),
}));

// `settings` degraded to null is the no-CMS state every assertion below runs
// in, so the fallbacks are what get exercised. The one test that needs a real
// `settings.ogImage` overrides this per-call.
const settingsData = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@workspace/sanity/live", () => ({
  PUBLISHED: {},
  sanityFetch: () => Promise.resolve({ data: settingsData.current }),
}));

const { getSEOMetadata, seoFromDocument } = await import("@/lib/seo");

/** `cache()` memoises per request; tests share a process, so read fresh. */
async function withSettings<T>(value: unknown, run: () => Promise<T>) {
  settingsData.current = value;
  try {
    return await run();
  } finally {
    settingsData.current = null;
  }
}

describe("getSEOMetadata robots", () => {
  it("honours the Studio's hide-from-search toggle", async () => {
    // The half of `seoNoIndex` that lives in this repo's own code. The other
    // half — the field reaching here from `generateMetadata` — is wiring, and
    // was silently missing until ROB-2546's follow-up.
    expect((await getSEOMetadata({ seoNoIndex: true })).robots).toBe(
      "noindex, nofollow"
    );
  });

  it("indexes by default, including when the field is absent", async () => {
    expect((await getSEOMetadata({ seoNoIndex: false })).robots).toBe(
      "index, follow"
    );
    expect((await getSEOMetadata({})).robots).toBe("index, follow");
  });
});

describe("getSEOMetadata open graph image", () => {
  it("generates a card when there is something for /api/og to resolve", async () => {
    const meta = await getSEOMetadata({
      slug: "/about-us",
      contentType: "page",
      contentId: "page-about",
    });
    expect(meta.openGraph?.images).toEqual([
      expect.objectContaining({
        url: "http://localhost:3000/api/og?id=page-about&type=page",
      }),
    ]);
  });

  it("falls back to the shipped image rather than an empty /api/og query", async () => {
    // The regression this guards: with no type and no id the URL was
    // `/api/og?`, which the handler renders as its "Something went Wrong with
    // image generation" card — what `/collections` and `/search` shipped to
    // every social scraper.
    const meta = await getSEOMetadata({ slug: "/search" });
    expect(meta.openGraph?.images).toEqual([
      expect.objectContaining({ url: "http://localhost:3000/opengraph.png" }),
    ]);
  });

  it("prefers the editor's default social image over the shipped one", async () => {
    const meta = await withSettings(
      {
        siteTitle: "Shop",
        siteDescription: "d",
        ogImage: "https://cdn/og.png",
      },
      () => getSEOMetadata({ slug: "/search" })
    );
    expect(meta.openGraph?.images).toEqual([
      expect.objectContaining({ url: "https://cdn/og.png" }),
    ]);
  });

  it("lets an explicit per-page image win over both", async () => {
    const meta = await getSEOMetadata({
      slug: "/about-us",
      contentType: "page",
      contentId: "page-about",
      ogImage: "https://cdn/page.png",
    });
    expect(meta.openGraph?.images).toEqual([
      expect.objectContaining({ url: "https://cdn/page.png" }),
    ]);
  });
});

describe("getSEOMetadata alternates", () => {
  it("keeps the canonical when a caller supplies its own alternates", async () => {
    // A spread used to replace the whole `alternates` key, so any caller
    // adding a language alternate silently dropped the canonical URL with it.
    const meta = await getSEOMetadata({
      slug: "/about-us",
      alternates: { languages: { "en-GB": "/en-gb/about-us" } },
    });
    expect(meta.alternates?.canonical).toBe("http://localhost:3000/about-us");
    expect(meta.alternates?.languages).toEqual({
      "en-GB": "/en-gb/about-us",
    });
  });

  it("withholds the markdown alternate on a noindex page", async () => {
    // Pointing a crawler at an alternate representation of a page you have
    // asked it not to index undoes the request.
    const indexed = await getSEOMetadata({ slug: "/about-us" });
    expect(indexed.alternates?.types).toEqual({
      "text/markdown": "http://localhost:3000/about-us.md",
    });

    const hidden = await getSEOMetadata({
      slug: "/about-us",
      seoNoIndex: true,
    });
    expect(hidden.alternates?.types).toBeUndefined();
  });
});

describe("seoFromDocument", () => {
  it("lets the SEO group override the content fields", async () => {
    const meta = await seoFromDocument(
      {
        title: "Content title",
        description: "Content description",
        seoTitle: "SEO title",
        seoDescription: "SEO description",
      },
      { slug: "/about-us" }
    );
    expect(meta.title).toBe("SEO title | Turbo Start BigCommerce");
    expect(meta.description).toBe("SEO description");
  });

  it("falls back to the content fields when no override is set", async () => {
    const meta = await seoFromDocument(
      { title: "Content title", description: "Content description" },
      { slug: "/about-us" }
    );
    expect(meta.title).toBe("Content title | Turbo Start BigCommerce");
    expect(meta.description).toBe("Content description");
  });

  it("uses the Open Graph overrides for the social card only", async () => {
    // These two fields have existed in the Studio, and ridden through on the
    // queries' bare `...` spread, since the OG group was added — and nothing
    // read them until now.
    const meta = await seoFromDocument(
      {
        title: "Page title",
        description: "Page description",
        ogTitle: "Social title",
        ogDescription: "Social description",
      },
      { slug: "/about-us" }
    );
    expect(meta.title).toBe("Page title | Turbo Start BigCommerce");
    expect(meta.openGraph?.title).toBe("Social title");
    expect(meta.openGraph?.description).toBe("Social description");
    expect(meta.twitter?.title).toBe("Social title");
  });

  it("carries seoNoIndex through, which every route once forgot", async () => {
    const meta = await seoFromDocument(
      { title: "Hidden", seoNoIndex: true },
      { slug: "/about-us" }
    );
    expect(meta.robots).toBe("noindex, nofollow");
  });

  it("canonicalises to the route, not the homepage, when the document is null", async () => {
    // The old per-route ternary passed `{}` on a null document, so the slug
    // defaulted to "/" and a missing page canonicalised itself to the homepage.
    const meta = await seoFromDocument(null, { slug: "/about-us" });
    expect(meta.alternates?.canonical).toBe("http://localhost:3000/about-us");
  });

  it("takes a caller's fallback title when the document has neither", async () => {
    const meta = await seoFromDocument(null, {
      slug: "/collections",
      title: "Collections",
      description: "Browse all collections",
    });
    expect(meta.title).toBe("Collections | Turbo Start BigCommerce");
    expect(meta.description).toBe("Browse all collections");
  });
});
