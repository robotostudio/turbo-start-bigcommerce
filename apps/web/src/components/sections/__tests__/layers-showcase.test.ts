import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * This block's query is disabled when the product reference is dangling, and a
 * disabled TanStack query is `isPending` with `isLoading === false` — so the
 * skeletons never ran either. What a shopper got was the heading beside four
 * empty grey squares and one empty grey panel, forever. `/api/products/{handle}`
 * failing produced the identical render, because `fetchProduct` turns a bad
 * response into `null`.
 *
 * The loading case is asserted alongside, because "render nothing when there is
 * no product" applied one beat too early would blank a healthy block on its
 * first paint.
 */

const useQuery = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => useQuery(options),
}));

vi.mock("@/components/cart/cart-context", () => ({
  useCartActions: () => ({ addLine: vi.fn(), openCart: vi.fn() }),
}));
vi.mock("@/components/product/store-image", () => ({
  StoreImage: ({ src }: { src: string }) => src,
}));

const { LayersShowcase } = await import("../layers-showcase");

const BLOCK = {
  _key: "block-1",
  _type: "layersShowcase" as const,
  heading: "Layers",
  description: "Built for weather",
};

describe("layers showcase block", () => {
  it("renders nothing when the product reference is gone", () => {
    useQuery.mockReturnValue({ data: undefined, isLoading: false });

    const markup = renderToStaticMarkup(
      createElement(LayersShowcase, { ...BLOCK, productHandle: null })
    );

    expect(markup).toBe("");
  });

  it("renders nothing when the product read comes back empty", () => {
    useQuery.mockReturnValue({ data: null, isLoading: false });

    const markup = renderToStaticMarkup(
      createElement(LayersShowcase, { ...BLOCK, productHandle: "field-parka" })
    );

    expect(markup).toBe("");
  });

  it("still renders its skeletons while the product is loading", () => {
    useQuery.mockReturnValue({ data: undefined, isLoading: true });

    const markup = renderToStaticMarkup(
      createElement(LayersShowcase, { ...BLOCK, productHandle: "field-parka" })
    );

    expect(markup).toContain("Layers");
  });
});
