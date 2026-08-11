import { readFileSync } from "node:fs";

import { initLogging } from "@workspace/logger";
import { afterEach, describe, expect, it, vi } from "vitest";

// Hoisted by vitest, so both run before `client.ts` is evaluated — it derives
// its endpoint from env at load time.
vi.mock("server-only", () => ({}));
vi.mock("@workspace/env/server", () => ({
  env: {
    BIGCOMMERCE_STORE_HASH: "testhash",
    BIGCOMMERCE_CHANNEL_ID: "42",
    BIGCOMMERCE_STOREFRONT_TOKEN: "test-token",
    BIGCOMMERCE_API_URL: undefined,
  },
}));

const { getProductMetafields, keyMetafields } = await import("../metafields");

function fixture(name: string) {
  return JSON.parse(
    readFileSync(
      new URL(`../__fixtures__/${name}.json`, import.meta.url),
      "utf8"
    )
  );
}

const POPULATED = fixture("metafields-turbo-start");
const UNKNOWN_NAMESPACE = fixture("metafields-unknown-namespace");

function mockFetch(response: unknown) {
  const fetchMock = vi.fn(
    (_url: string, _init: RequestInit): Promise<Response> =>
      Promise.resolve(
        new Response(JSON.stringify(response), {
          status: 200,
          headers: { "x-bc-graphql-complexity": "60" },
        })
      )
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // evlog keeps one process-wide config, so a drain installed by a test would
  // otherwise still be collecting during the next one.
  initLogging({ enabled: false });
});

/** The captured edges for the populated namespace. */
const EDGES = POPULATED.response.data.site.product.metafields.edges;

describe("keyMetafields", () => {
  it("keys the connection by metafield key", () => {
    expect(keyMetafields(EDGES)).toEqual({
      product_type: "Jacket",
      tags: "jacket, leather, moto, new, outerwear, premium",
    });
  });

  it("does not depend on the position an entry arrives in", () => {
    expect(keyMetafields([...EDGES].reverse())).toEqual(keyMetafields(EDGES));
  });

  it("drops blank values and tolerates a missing connection", () => {
    expect(keyMetafields([{ node: { key: "tags", value: "  " } }])).toEqual({});
    expect(keyMetafields(undefined)).toEqual({});
    expect(keyMetafields(null)).toEqual({});
  });
});

describe("getProductMetafields", () => {
  it("reads the populated namespace", async () => {
    const fetchMock = mockFetch(POPULATED.response);

    const metafields = await getProductMetafields(189, "turbo_start");

    expect(metafields.product_type).toBe("Jacket");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(JSON.parse(String(init?.body)).variables).toMatchObject({
      entityId: 189,
      namespace: "turbo_start",
    });
  });

  it("returns an empty map for an unknown namespace and names the ambiguity", async () => {
    // An absent namespace and a namespace whose metafields were written with
    // the wrong permission_set are byte-identical here, so the reader answers
    // {} for both and says why in the log rather than pretending to know.
    //
    // Read through a drain rather than a `console.warn` spy: which console
    // method the logger reaches for is evlog's business and changes with the
    // pretty setting. The event is the stable surface.
    const logged: string[] = [];
    initLogging({
      silent: true,
      drain: (ctx) => {
        logged.push(`${ctx.event.level} ${ctx.event.message}`);
      },
    });
    mockFetch(UNKNOWN_NAMESPACE.response);

    const metafields = await getProductMetafields(189, "does_not_exist");

    expect(metafields).toEqual({});
    // Not `logged[0]` — the client logs the request itself first.
    expect(logged.filter((line) => line.includes("permission_set"))).toEqual([
      expect.stringMatching(/^warn /),
    ]);
  });

  it("returns an empty map when the request fails", async () => {
    mockFetch({ errors: [{ message: "boom" }] });

    await expect(getProductMetafields(189)).resolves.toEqual({});
  });
});
