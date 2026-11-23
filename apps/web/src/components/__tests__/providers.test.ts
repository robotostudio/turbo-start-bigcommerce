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

// A block seeding React Query on the server, as featured-products.tsx does with
// its prerendered cards. (The collection grid renders only in the browser.)
function Seeded({ cards }: { cards: string }) {
  const { data } = useQuery({
    queryKey: ["featured-products-cards", "wren-washed-cap"],
    queryFn: () => Promise.resolve("fetched"),
    initialData: cards,
  });
  return createElement("p", null, data);
}

function SeededStaleness() {
  const { isStale } = useQuery({
    queryKey: ["collection-products", "all-products"],
    queryFn: () => Promise.resolve("fetched"),
    initialData: "prerendered",
  });
  return createElement("p", null, `stale:${isStale}`);
}

const renderRequest = (cards: string) =>
  renderToString(
    createElement(Providers, null, createElement(Seeded, { cards }))
  );

describe("Providers on the server", () => {
  it("gives each request its own query cache, so fresh initialData wins", () => {
    expect(renderRequest("Wren Washed Cap, £42")).toContain(
      "Wren Washed Cap, £42"
    );
    expect(renderRequest("Wren Washed Cap, £38")).toContain(
      "Wren Washed Cap, £38"
    );
  });

  it("leaves a server seed stale, so the browser revalidates it on mount", () => {
    // Collection and featured-product seeds come from ISR pages (up to 300s
    // old); refetching on mount is what keeps them from outliving the catalog.
    expect(
      renderToString(
        createElement(Providers, null, createElement(SeededStaleness))
      )
    ).toContain("stale:true");
  });
});
