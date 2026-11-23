import { useQuery } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { Providers } from "../providers";

// The cart and saved-items providers reach into server actions and env; this
// test is about the query client, so they pass their children straight through.
const { passThrough } = vi.hoisted(() => ({
  passThrough: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../cart/cart-context", () => ({ CartProvider: passThrough }));
vi.mock("../saved-items/saved-items-context", () => ({
  SavedItemsProvider: passThrough,
}));

// A block seeding React Query from server props, as collection-products.tsx
// does with a category's facets.
function Seeded({ facets }: { facets: string }) {
  const { data } = useQuery({
    queryKey: ["collection-products", "blower-silencers"],
    queryFn: () => Promise.resolve("fetched"),
    initialData: facets,
  });
  return createElement("p", null, data);
}

const renderRequest = (facets: string) =>
  renderToString(
    createElement(Providers, null, createElement(Seeded, { facets }))
  );

describe("Providers on the server", () => {
  it("gives each request its own query cache, so fresh initialData wins", () => {
    expect(renderRequest("Brand, Price, Other")).toContain(
      "Brand, Price, Other"
    );
    expect(renderRequest("Brand, Price, Max Flow")).toContain(
      "Brand, Price, Max Flow"
    );
  });
});
