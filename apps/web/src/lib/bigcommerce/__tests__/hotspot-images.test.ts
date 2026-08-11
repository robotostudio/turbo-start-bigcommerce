import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../featured", () => ({ getFeaturedProducts: vi.fn() }));

const { getFeaturedProducts } = await import("../featured");
const { getHotspotImages } = await import("../hotspot-images");

const fetchProducts = vi.mocked(getFeaturedProducts);

function hotspotBlock(...entityIds: (number | null)[]) {
  return {
    _type: "imageWithProductHotspots",
    _key: "spot-block",
    productHotspots: entityIds.map((entityId, index) => ({
      _key: `spot-${index}`,
      productWithVariant: {
        product: {
          store: {
            entityId,
            title: "Ashcroft Linen-Cotton Shirt",
            previewImageUrl: "https://cdn11.bigcommerce.com/synced.png",
          },
        },
      },
    })),
  };
}

beforeEach(() => {
  fetchProducts.mockReset();
  fetchProducts.mockResolvedValue([]);
});

describe("getHotspotImages", () => {
  it("asks BigCommerce for each hotspot product once", async () => {
    fetchProducts.mockResolvedValue([
      {
        entityId: 180,
        defaultImage: { url: "https://cdn11.bigcommerce.com/live-180.png" },
      },
      // biome-ignore lint/suspicious/noExplicitAny: the storefront fragment is wider than this test needs
    ] as any);

    // 180 twice: one product carrying two hotspots costs one lookup, not two.
    const images = await getHotspotImages([hotspotBlock(180, 180, 24)]);

    expect(fetchProducts).toHaveBeenCalledWith([180, 24]);
    expect(images).toEqual({
      180: "https://cdn11.bigcommerce.com/live-180.png",
    });
  });

  /**
   * The id BigCommerce did not resolve is simply absent, which is what makes
   * the caller's `?? previewImageUrl` the whole fallback path — no branch of
   * its own, and the same shape whether the product is hidden or the store is
   * unreachable.
   */
  it("leaves out a product the storefront did not return", async () => {
    expect(await getHotspotImages([hotspotBlock(180)])).toEqual({});
  });

  it("makes no request for a body with no hotspots", async () => {
    // `getFeaturedProducts([])` reads as "the editor picked nothing" and
    // answers with the newest products, so the empty case must never reach it.
    await getHotspotImages([{ _type: "block", _key: "b", children: [] }]);
    await getHotspotImages(null);
    await getHotspotImages([hotspotBlock()]);

    expect(fetchProducts).not.toHaveBeenCalled();
  });

  it("skips a hotspot whose product was tombstoned by the sync", async () => {
    // The projection nulls `product` once `store.isDeleted` is true.
    await getHotspotImages([
      {
        _type: "imageWithProductHotspots",
        _key: "spot-block",
        productHotspots: [{ _key: "s", productWithVariant: { product: null } }],
      },
    ]);

    expect(fetchProducts).not.toHaveBeenCalled();
  });
});
