import { describe, expect, it, vi } from "vitest";

import { type EvlogLog, makeLogger, toEvent } from "./core";

function fakeLog() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } satisfies EvlogLog;
}

describe("toEvent", () => {
  /**
   * The point of the whole facade. A drain that receives
   * `"sync failed: 500 on 180"` gives you a text search; one that receives
   * `{ entityId: 180, status: 500 }` gives you a query.
   */
  it("lifts a plain object into top-level fields", () => {
    expect(
      toEvent("BigCommerceWebhook", "sync failed", [
        { entityId: 180, scope: "store/product/updated" },
      ])
    ).toEqual({
      tag: "BigCommerceWebhook",
      message: "sync failed",
      entityId: 180,
      scope: "store/product/updated",
    });
  });

  it("merges several objects", () => {
    expect(toEvent("Sync", "done", [{ a: 1 }, { b: 2 }])).toMatchObject({
      a: 1,
      b: 2,
    });
  });

  /**
   * An Error's own properties are non-enumerable, so `{ ...error }` is `{}` and
   * the message and stack are gone. This is why errors get a branch rather than
   * falling through to the object case.
   */
  it("flattens an Error instead of spreading it away", () => {
    const error = new Error("kaboom");
    const event = toEvent("Sync", "read failed", [error]);

    expect({ ...error }).toEqual({});
    expect(event.error).toMatchObject({ name: "Error", message: "kaboom" });
    expect((event.error as { stack: string }).stack).toContain("kaboom");
  });

  it("keeps values that have no field name to go under", () => {
    expect(toEvent("Cart", "odd", ["a string", 42, null])).toMatchObject({
      details: ["a string", 42, null],
    });
  });

  it("leaves details off when every argument was a field", () => {
    expect(toEvent("Cart", "fine", [{ ok: true }])).not.toHaveProperty(
      "details"
    );
  });

  /**
   * `logger.info("saved", { message: "..." })` must not blank out the line the
   * log is about, and must not relabel which logger it came from.
   */
  it("does not let caller fields overwrite tag or message", () => {
    expect(
      toEvent("Sync", "the real message", [
        { message: "hijacked", tag: "SomethingElse" },
      ])
    ).toMatchObject({ tag: "Sync", message: "the real message" });
  });

  /**
   * `llms.txt/route.ts` logs a rejected promise's `reason`, a shape nothing
   * here controls. If that reason is a plain object rather than an `Error`, its
   * `message` is the most useful thing in it — losing it to a key collision
   * would be the worst outcome of the two.
   */
  it("keeps what it displaced rather than dropping it", () => {
    expect(
      toEvent("LlmsTxt", "Failed to load blogs", [
        { message: "connection refused", status: 503 },
      ])
    ).toEqual({
      tag: "LlmsTxt",
      message: "Failed to load blogs",
      status: 503,
      shadowed: { message: "connection refused" },
    });
  });

  it("leaves shadowed off when nothing collided", () => {
    expect(toEvent("Sync", "fine", [{ ok: true }])).not.toHaveProperty(
      "shadowed"
    );
  });

  /**
   * evlog builds the event as `{ timestamp, level, ...env, ...event }` with the
   * caller's fields spread last, so these are takeable too. An `info` recorded
   * as `level: "debug"` is one alerting rule never fires on.
   */
  it("protects the stamps evlog puts on the event, not just tag and message", () => {
    const event = toEvent("Sync", "collide", [
      { level: "debug", service: "hacked", timestamp: 0, region: "nowhere" },
    ]);

    expect(event).not.toHaveProperty("level");
    expect(event).not.toHaveProperty("service");
    expect(event).not.toHaveProperty("timestamp");
    expect(event).not.toHaveProperty("region");
    expect(event.shadowed).toEqual({
      level: "debug",
      service: "hacked",
      timestamp: 0,
      region: "nowhere",
    });
  });

  /**
   * A failed `fetch` says `fetch failed` and nothing else. The reason anyone
   * needs is one level down. `hook-health/route.ts` logs exactly this shape.
   */
  it("follows the cause chain", () => {
    const cause = Object.assign(new Error("getaddrinfo ENOTFOUND"), {
      name: "Error",
    });
    const event = toEvent("HookHealth", "probe failed", [
      new Error("fetch failed", { cause }),
    ]);

    expect(event.error).toMatchObject({
      message: "fetch failed",
      cause: { message: "getaddrinfo ENOTFOUND" },
    });
  });

  it("stops following a circular cause chain", () => {
    const a = new Error("a");
    const b = new Error("b", { cause: a });
    (a as Error & { cause?: unknown }).cause = b;

    expect(() => toEvent("Sync", "loop", [a])).not.toThrow();
  });

  /** Sanity's ClientError carries the whole HTTP response, headers included. */
  it("does not copy an error's other own properties", () => {
    const error = Object.assign(new Error("Unauthorized"), {
      response: { headers: { authorization: "Bearer sk-secret" } },
    });

    expect(toEvent("Sync", "failed", [error]).error).not.toHaveProperty(
      "response"
    );
  });

  it("keeps a second error instead of evicting the first", () => {
    const event = toEvent("Sync", "both failed", [
      new Error("first"),
      new Error("second"),
    ]);

    expect(event.error).toMatchObject({ message: "first" });
    expect(event.details).toMatchObject([{ message: "second" }]);
  });

  /** `Object.assign` onto a normal object runs `Object.prototype`'s setter. */
  it("keeps a field literally named __proto__ rather than losing it", () => {
    const event = toEvent("Sync", "odd key", [
      JSON.parse('{"__proto__": "not a prototype", "ok": 1}'),
    ]);

    expect(event.ok).toBe(1);
    // Both halves matter: the field survives as data, and it is data — it did
    // not become the event's prototype on the way through.
    expect(Object.hasOwn(event, "__proto__")).toBe(true);
    expect(Object.getOwnPropertyDescriptor(event, "__proto__")?.value).toBe(
      "not a prototype"
    );
    expect(Object.getPrototypeOf(event)).toBe(Object.prototype);
  });

  /**
   * `sitemap.ts` passes `{ error: result.error }` and means it, so a caller's
   * `error` is only displaced when this call actually produced one.
   */
  it("leaves a caller's error field alone when no Error was passed", () => {
    expect(
      toEvent("Sitemap", "failed", [{ error: "not found" }])
    ).toMatchObject({ error: "not found" });
  });

  it("does not let a caller's error field land on top of a real Error", () => {
    const event = toEvent("Sync", "failed", [
      new Error("the real one"),
      { error: "a string" },
    ]);

    expect(event.error).toMatchObject({ message: "the real one" });
    expect(event.shadowed).toEqual({ error: "a string" });
  });

  it("does not let a caller's details field discard collected values", () => {
    const event = toEvent("Sync", "mixed", ["a string", { details: "mine" }]);

    expect(event.details).toEqual(["a string"]);
    expect(event.shadowed).toEqual({ details: "mine" });
  });

  it("treats an array as a detail, not as fields", () => {
    expect(toEvent("Sync", "list", [[1, 2]])).toMatchObject({
      details: [[1, 2]],
    });
  });
});

describe("Logger", () => {
  it("uses the tag/message form when there is nothing to carry", () => {
    const log = fakeLog();
    const Logger = makeLogger(log);

    new Logger("Sitemap").info("built 42 urls");

    expect(log.info).toHaveBeenCalledWith("Sitemap", "built 42 urls");
  });

  it("switches to the event form as soon as an argument arrives", () => {
    const log = fakeLog();
    const Logger = makeLogger(log);

    new Logger("Sitemap").error("failed", { label: "blogs" });

    expect(log.error).toHaveBeenCalledWith({
      tag: "Sitemap",
      message: "failed",
      label: "blogs",
    });
  });

  it("routes each level to its own evlog method", () => {
    const log = fakeLog();
    const Logger = makeLogger(log);
    const logger = new Logger("Ctx");

    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");

    expect(log.debug).toHaveBeenCalledWith("Ctx", "d");
    expect(log.info).toHaveBeenCalledWith("Ctx", "i");
    expect(log.warn).toHaveBeenCalledWith("Ctx", "w");
    expect(log.error).toHaveBeenCalledWith("Ctx", "e");
  });

  /** Both spellings are in use — `auto-redirect` and `cart/actions` say warning. */
  it("treats warning as warn", () => {
    const log = fakeLog();
    const Logger = makeLogger(log);

    new Logger("Cart").warning("stale cookie");

    expect(log.warn).toHaveBeenCalledWith("Cart", "stale cookie");
    expect(log.error).not.toHaveBeenCalled();
  });
});
