import { describe, expect, it } from "vitest";

import {
  type CatalogDocument,
  type ContentDocument,
  parsePlaceholder,
  remapSeedRefs,
} from "./seed-refs.js";

/**
 * The sandbox minted its own ids: the slugs match the seed content, the numbers
 * do not. This is the state the seed cannot rehearse against the reference
 * store, where they happen to agree.
 */
const catalog: CatalogDocument[] = [
  {
    _id: "bigcommerceProduct-47",
    _type: "bigcommerceProduct",
    slug: "bramley-wool-crewneck",
  },
  {
    _id: "bigcommerceCategory-12",
    _type: "bigcommerceCategory",
    slug: "shirts",
  },
];

const homePage: ContentDocument = {
  _id: "homePage",
  _type: "homePage",
  pageBuilder: [
    {
      _key: "featuredHome",
      _type: "featuredProducts",
      products: [
        {
          _key: "featured-bramley",
          _type: "reference",
          _weak: true,
          _ref: "bigcommerceProduct-bramley-wool-crewneck",
        },
      ],
    },
  ],
};

describe("parsePlaceholder", () => {
  it("reads a slug placeholder", () => {
    expect(parsePlaceholder("bigcommerceCategory-new-arrivals")).toEqual({
      type: "bigcommerceCategory",
      slug: "new-arrivals",
    });
  });

  it("rejects a real synced id", () => {
    expect(parsePlaceholder("bigcommerceProduct-191")).toBeNull();
  });

  it("rejects an unrelated document id", () => {
    expect(parsePlaceholder("blogIndex")).toBeNull();
  });
});

describe("remapSeedRefs", () => {
  it("repoints a nested reference at the id this dataset actually holds", () => {
    const result = remapSeedRefs([homePage], catalog);

    expect(result.mutations).toEqual([
      {
        patch: {
          id: "homePage",
          set: {
            'pageBuilder[_key=="featuredHome"].products[_key=="featured-bramley"]._ref':
              "bigcommerceProduct-47",
          },
        },
      },
    ]);
    expect(result.resolved).toBe(1);
    expect(result.unresolved).toEqual([]);
  });

  it("addresses array members by _key, so a reorder cannot move the patch", () => {
    const reordered: ContentDocument = {
      ...homePage,
      pageBuilder: [
        { _key: "heroHome", _type: "hero" },
        (homePage.pageBuilder as unknown[])[0],
      ],
    };

    expect(remapSeedRefs([reordered], catalog).mutations).toEqual(
      remapSeedRefs([homePage], catalog).mutations
    );
  });

  it("resolves a reference nested under an object rather than an array", () => {
    const navbar: ContentDocument = {
      _id: "navbar",
      _type: "navbar",
      columns: [
        {
          _key: "col-shirts",
          url: {
            _type: "customUrl",
            internal: {
              _type: "reference",
              _weak: true,
              _ref: "bigcommerceCategory-shirts",
            },
          },
        },
      ],
    };

    expect(remapSeedRefs([navbar], catalog).mutations).toEqual([
      {
        patch: {
          id: "navbar",
          set: {
            'columns[_key=="col-shirts"].url.internal._ref':
              "bigcommerceCategory-12",
          },
        },
      },
    ]);
  });

  it("leaves an already-resolved reference alone, so a second run is a no-op", () => {
    const patched: ContentDocument = {
      _id: "homePage",
      _type: "homePage",
      pageBuilder: [
        {
          _key: "featuredHome",
          products: [
            {
              _key: "featured-bramley",
              _type: "reference",
              _ref: "bigcommerceProduct-47",
            },
          ],
        },
      ],
    };

    expect(remapSeedRefs([patched], catalog)).toEqual({
      mutations: [],
      unresolved: [],
      resolved: 0,
    });
  });

  it("names the slug it could not resolve instead of writing a broken patch", () => {
    const missing: ContentDocument = {
      _id: "promoBanner",
      _type: "promoBanner",
      link: { _ref: "bigcommerceCategory-sale", _type: "reference" },
    };

    const result = remapSeedRefs([missing], catalog);

    expect(result.mutations).toEqual([]);
    expect(result.unresolved).toEqual(["bigcommerceCategory:sale"]);
  });

  it("ignores references to editorial documents", () => {
    const blogIndex: ContentDocument = {
      _id: "navbar",
      _type: "navbar",
      link: { _ref: "blogIndex", _type: "reference" },
    };

    expect(remapSeedRefs([blogIndex], catalog).mutations).toEqual([]);
  });
});
