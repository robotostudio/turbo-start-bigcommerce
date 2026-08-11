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
