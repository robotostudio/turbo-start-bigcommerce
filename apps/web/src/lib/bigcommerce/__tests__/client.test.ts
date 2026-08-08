import { afterEach, describe, expect, it, vi } from "vitest";

// Hoisted by vitest, so both run before the client module is evaluated —
// which matters, because it derives its endpoint from env at load time.
vi.mock("server-only", () => ({}));
vi.mock("@workspace/env/server", () => ({
  env: {
    BIGCOMMERCE_STORE_HASH: "testhash",
    BIGCOMMERCE_CHANNEL_ID: "42",
    BIGCOMMERCE_STOREFRONT_TOKEN: "test-token",
    BIGCOMMERCE_API_URL: undefined,
  },
}));

const { storefrontQuery, storefrontUrl } = await import("../client");

/** Response with a complexity header, as BigCommerce always sends one. */
function reply(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "x-bc-graphql-complexity": "220" },
  });
}

function mockFetch(value: Response | Error) {
  const fetchMock = vi.fn(
    (_url: string, _init: RequestInit): Promise<Response> =>
      value instanceof Error ? Promise.reject(value) : Promise.resolve(value)
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("storefrontUrl", () => {
  it("derives the endpoint from the store hash and channel id", () => {
    expect(storefrontUrl).toBe(
      "https://store-testhash-42.mybigcommerce.com/graphql"
    );
  });
});

describe("storefrontQuery", () => {
  it("returns the data and sends the private token", async () => {
    const fetchMock = mockFetch(reply('{"data":{"site":{"id":"1"}}}'));

    const result = await storefrontQuery<{ site: { id: string } }, never>(
      "query { site { id } }"
    );

    expect(result).toEqual({ ok: true, data: { site: { id: "1" } } });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const headers = init?.headers as Record<string, string> | undefined;
    expect(url).toBe(storefrontUrl);
    expect(headers?.Authorization).toBe("Bearer test-token");
  });

  it("logs the complexity header against the per-request limit", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    mockFetch(reply('{"data":{"ok":true}}'));

    await storefrontQuery("query { site { id } }");

    expect(log.mock.calls[0]?.[0]).toContain("complexity=220/10000");
  });

  it("surfaces the raw error array and HTTP status on a GraphQL failure", async () => {
    mockFetch(
      reply(
        '{"data":{"cart":{"createCart":null}},"errors":[{"message":"Not Found: Cart does not exist","path":["cart","createCart"],"locations":[{"line":3,"column":5}]},{"message":"second"}]}'
      )
    );

    const result = await storefrontQuery("mutation { noop }");

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    // The joined message survives for logs; `path` survives for the
    // classifier, whose cart/non-cart split hangs off it.
    expect(result.error).toBe("Not Found: Cart does not exist; second");
    expect(result.status).toBe(200);
    expect(result.errors).toEqual([
      {
        message: "Not Found: Cart does not exist",
        path: ["cart", "createCart"],
        locations: [{ line: 3, column: 5 }],
      },
      { message: "second" },
    ]);
  });

  it("reports the HTTP status on a non-2xx response with no errors array", async () => {
    mockFetch(reply("{}", 401));

    const result = await storefrontQuery("query { site { id } }");

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.status).toBe(401);
    expect(result.errors).toBeUndefined();
  });

  const cases = [
    {
      name: "GraphQL errors, even on a 200",
      response: reply('{"errors":[{"message":"boom"}]}'),
      kind: "graphql",
      error: "boom",
    },
    {
      name: "an auth failure",
      response: reply("{}", 401),
      kind: "graphql",
      error: "Storefront API returned 401",
    },
    {
      name: "a server error",
      response: reply("{}", 503),
      kind: "network",
      error: "Storefront API returned 503",
    },
    {
      name: "rate limiting",
      response: reply("{}", 429),
      kind: "network",
      error: "Storefront API returned 429",
    },
    {
      name: "an HTML error page",
      response: reply("<html>gateway</html>", 404),
      kind: "unknown",
      error: "non-JSON body",
    },
    {
      name: "a transport failure",
      response: new Error("ECONNREFUSED"),
      kind: "network",
      error: "ECONNREFUSED",
    },
    {
      name: "an empty payload",
      response: reply("{}"),
      kind: "unknown",
      error: "No data returned",
    },
  ] as const;

  for (const { name, response, kind, error } of cases) {
    it(`classifies ${name} as ${kind}`, async () => {
      mockFetch(response);

      const result = await storefrontQuery("query { site { id } }");

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.kind).toBe(kind);
      expect(result.error).toContain(error);
    });
  }
});
