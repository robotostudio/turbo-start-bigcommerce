import { afterEach, describe, expect, it, vi } from "vitest";

import { type DrainContext, initLogging, Logger } from "./index";

/**
 * These run against the real evlog, not a fake, because the thing worth
 * asserting is what a drain actually receives — that is the whole reason the
 * logger was moved off `console.*`.
 *
 * `initLogger` is process-wide and last-call-wins, so every test re-initialises
 * and the last one hands the process back with logging switched off.
 */
function collect() {
  const events: Record<string, unknown>[] = [];
  initLogging({
    env: { service: "logger-test" },
    drain: (ctx: DrainContext) => {
      events.push(ctx.event as Record<string, unknown>);
    },
  });
  return events;
}

afterEach(() => {
  initLogging({ enabled: false });
});

describe("a configured drain", () => {
  /**
   * The guard in `initLogging`. evlog's `log.info(tag, message)` path prints and
   * returns before the drain runs whenever pretty printing is on, and pretty is
   * on by default in development — so a message with no extra fields, which is
   * most of them, would never leave the console.
   */
  it("receives logs that carry no fields at all", () => {
    const events = collect();

    new Logger("Sitemap").info("built 42 urls");

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      level: "info",
      tag: "Sitemap",
      message: "built 42 urls",
    });
  });

  it("receives extra arguments as queryable fields, not as prose", () => {
    const events = collect();

    new Logger("BigCommerceWebhook").error("sync failed", {
      entityId: 180,
      scope: "store/product/updated",
    });

    expect(events[0]).toMatchObject({
      level: "error",
      tag: "BigCommerceWebhook",
      message: "sync failed",
      // The assertion that matters: a number, at the top level, under a name
      // something can filter on — not interpolated into the message.
      entityId: 180,
      scope: "store/product/updated",
    });
  });

  it("receives an error with its message and stack intact", () => {
    const events = collect();

    new Logger("Sync").error("read failed", new Error("kaboom"));

    expect(events[0]?.error).toMatchObject({
      name: "Error",
      message: "kaboom",
    });
  });

  it("stamps every event with the level and the service", () => {
    const events = collect();
    const logger = new Logger("Ctx");

    logger.info("i");
    logger.warn("w");
    logger.warning("w2");
    logger.error("e");

    expect(events.map((event) => event.level)).toEqual([
      "info",
      "warn",
      "warn",
      "error",
    ]);
    expect(new Set(events.map((event) => event.service))).toEqual(
      new Set(["logger-test"])
    );
  });

  it("stops emitting once logging is disabled", () => {
    const events = collect();
    initLogging({ enabled: false });

    new Logger("Ctx").info("nothing should reach the drain");

    expect(events).toHaveLength(0);
  });
});

/**
 * evlog serialises with a bare `JSON.stringify`, and nothing between here and
 * there has a try/catch. Before evlog this was `console.log`, which swallows
 * anything. The values below both raise out of the call, so the guard lives in
 * `#emit` rather than in a serialiser.
 *
 * `llms.txt/route.ts` logs a rejected promise's `reason` — an arbitrary value —
 * from inside a failure path, which is the worst place to add a new throw.
 */
describe("a value that cannot be serialised", () => {
  const cyclic: Record<string, unknown> = { name: "x" };
  cyclic.self = cyclic;

  it.each([
    ["a circular reference", cyclic],
    ["a BigInt", { count: 1n }],
  ])("does not throw out of the log call: %s", (_label, value) => {
    initLogging({ env: { service: "logger-test" } });
    const logger = new Logger("LlmsTxt");

    expect(() => logger.error("Failed to load blogs", value)).not.toThrow();
  });

  it("still says what happened when it falls back", () => {
    initLogging({ env: { service: "logger-test" } });
    const stderr = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    new Logger("LlmsTxt").error("Failed to load blogs", cyclic);

    expect(String(stderr.mock.calls.at(-1)?.[0])).toBe(
      "[LlmsTxt] ERROR: Failed to load blogs"
    );
    stderr.mockRestore();
  });
});
