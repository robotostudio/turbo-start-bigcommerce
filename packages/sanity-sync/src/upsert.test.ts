import { describe, expect, it } from "vitest";

import {
  categoryDocumentId,
  productDocumentId,
  productDocuments,
  type RestCategory,
  type RestProduct,
  type RestVariant,
  slugFromPath,
  softDeleteMutations,
  staleMutations,
  toCategoryDocument,
  toProductDocument,
  toVariantDocument,
  upsertMutations,
  variantDocumentId,
} from "./upsert.js";

/** Trimmed from the real sandbox response for store 8jbhprizry. */
const variant: RestVariant = {
  id: 167,
  product_id: 180,
  sku: "TS-P3-FAD-XS",
  price: 89,
  sale_price: 0,
  calculated_price: 89,
  inventory_level: 30,
  image_url: "https://cdn11.bigcommerce.com/s-8jbhprizry/18_source.png",
  purchasing_disabled: false,
  option_values: [
    { id: 113, label: "XS", option_display_name: "Size" },
    { id: 133, label: "Faded Rose", option_display_name: "Color" },
  ],
};

const product: RestProduct = {
  id: 180,
  name: "Ashcroft Linen-Cotton Shirt",
  sku: "",
  description: "<p>A button-down shirt in a linen-cotton blend.</p>",
  price: 89,
  sale_price: 0,
  calculated_price: 89,
  is_visible: true,
  brand_id: 0,
  categories: [33, 38, 40],
  date_created: "2026-08-07T16:38:42+00:00",
  date_modified: "2026-08-07T16:45:14+00:00",
  custom_url: { url: "/products/ashcroft-linen-cotton-shirt/" },
  variants: [variant],
  options: [{ id: 118, display_name: "Size" }],
  images: [
    { url_standard: "https://cdn/a.jpg", is_thumbnail: true, sort_order: 0 },
  ],
};

const category: RestCategory = {
  id: 42,
  parent_id: 36,
  name: "Leather",
  description: "<p>Leather jackets.</p>",
  is_visible: true,
  image_url: "",
  custom_url: { url: "/collections/jackets/leather/" },
};

/** Every mutation key a run may emit. Anything else is a bug. */
function mutationKinds(mutations: unknown[]): string[] {
  return mutations.flatMap((m) => Object.keys(m as object));
}

describe("deterministic ids", () => {
  it("keys documents on entityId so a stub joins later with no migration", () => {
    expect(productDocumentId(180)).toBe("bigcommerceProduct-180");
    expect(variantDocumentId(167)).toBe("bigcommerceProductVariant-167");
    expect(categoryDocumentId(42)).toBe("bigcommerceCategory-42");

    expect(toProductDocument(product)._id).toBe("bigcommerceProduct-180");
    // Storefront GraphQL Variant.entityId == REST variant.id, not sku_id.
    expect(toVariantDocument(variant)._id).toBe(
      "bigcommerceProductVariant-167"
    );
    expect(toCategoryDocument(category)._id).toBe("bigcommerceCategory-42");
  });

  it("is idempotent — the same entity always produces the same id", () => {
    expect(toProductDocument(product)._id).toBe(
      toProductDocument({ ...product, name: "Renamed" })._id
    );
  });
});

describe("rule 1: patch the synced subtree only", () => {
  const mutations = upsertMutations(toProductDocument(product));

  it("never emits createOrReplace", () => {
    // This is exactly what apps/studio/scripts/sync-bigcommerce-sanity.ts did,
    // and what wipes body/hero/modules/seo on every run.
    expect(mutationKinds(mutations)).toEqual(["createIfNotExists", "patch"]);
    expect(mutationKinds(mutations)).not.toContain("createOrReplace");
  });

  it("writes nothing outside the store subtree", () => {
    for (const mutation of mutations) {
      if (!("patch" in mutation)) {
        continue;
      }
      const keys = Object.keys(mutation.patch.set ?? {});
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(key === "store" || key.startsWith("store.")).toBe(true);
      }
      // No path-based removals either — unset is how a subtree patch leaks.
      expect(mutation.patch.unset).toBeUndefined();
    }
  });

  it("leaves a sibling editor-owned field untouched when applied", () => {
    const existing = {
      _id: "bigcommerceProduct-180",
      _type: "bigcommerceProduct",
      body: [{ _type: "block", children: [{ text: "Editor copy" }] }],
      seo: { title: "Hand-written SEO title" },
      store: { title: "Stale title", isDeleted: false },
    };

    const patch = mutations.find((m) => "patch" in m);
    const applied = {
      ...existing,
      ...(patch as { patch: { set: object } }).patch.set,
    };

    expect(applied.body).toBe(existing.body);
    expect(applied.seo).toBe(existing.seo);
    expect(applied.store).toMatchObject({
      title: "Ashcroft Linen-Cotton Shirt",
      entityId: 180,
    });
  });
});

describe("rule 2: soft-delete with a flag", () => {
  const mutations = softDeleteMutations("bigcommerceProduct-180");

  it("sets the flag instead of removing the document", () => {
    expect(mutationKinds(mutations)).toEqual(["patch"]);
    expect(mutationKinds(mutations)).not.toContain("delete");
    expect(mutations).toEqual([
      {
        patch: {
          id: "bigcommerceProduct-180",
          setIfMissing: { store: {} },
          set: { "store.isDeleted": true },
        },
      },
    ]);
  });

  it("touches only store.isDeleted, so editor fields survive the delete", () => {
    const patch = (mutations[0] as { patch: { set: Record<string, unknown> } })
      .patch;
    expect(Object.keys(patch.set)).toEqual(["store.isDeleted"]);
  });
});

describe("the product unit shared by the sweep and the single-entity sync", () => {
  it("is the product plus every variant on it", () => {
    expect(productDocuments(product).map((d) => d._id)).toEqual([
      "bigcommerceProduct-180",
      "bigcommerceProductVariant-167",
    ]);
  });

  it("yields the product alone when variants were not included", () => {
    // The include failing must never look like "every variant was deleted" —
    // the orphan pass in syncProduct diffs against exactly this list.
    const withoutInclude: RestProduct = { ...product, variants: undefined };
    expect(productDocuments(withoutInclude).map((d) => d._id)).toEqual([
      "bigcommerceProduct-180",
    ]);
  });
});

describe("stale ids", () => {
  const kept = new Set(["bigcommerceProductVariant-167"]);

  it("soft-deletes what the run did not see and nothing it did", () => {
    expect(
      staleMutations(
        ["bigcommerceProductVariant-167", "bigcommerceProductVariant-999"],
        kept
      )
    ).toEqual(softDeleteMutations("bigcommerceProductVariant-999"));
  });

  it("emits nothing when everything live was seen", () => {
    expect(staleMutations(["bigcommerceProductVariant-167"], kept)).toEqual([]);
  });
});

describe("slugs", () => {
  it("strips the route prefix and flattens nested category paths", () => {
    expect(slugFromPath("/products/wren-washed-cap/")).toBe("wren-washed-cap");
    expect(slugFromPath("/collections/jackets/leather/")).toBe(
      "jackets-leather"
    );
    // Customised product URL — no /products/ prefix on the sandbox.
    expect(slugFromPath("/turbo-start-care-guide-digital/")).toBe(
      "turbo-start-care-guide-digital"
    );
  });
});
