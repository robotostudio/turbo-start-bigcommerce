import { initLogger, log } from "evlog";

import { makeLogger } from "./core";

export const Logger = makeLogger(log);
export type Logger = InstanceType<typeof Logger>;

export type { DrainContext, LoggerConfig, WideEvent } from "evlog";

/**
 * Configure logging for a process. Call it once, as early as the runtime
 * allows — `apps/web/src/instrumentation.ts` for the Next.js server.
 *
 * Nothing breaks if it is never called: evlog writes to stdout with detected
 * defaults, which is what Vercel collects today.
 *
 * It exists so that a log drain has one place to be configured, rather than a
 * new dependency in every app. When that day comes:
 *
 * ```ts
 * import { createAxiomDrain } from "evlog/axiom";
 * initLogging({ drain: createAxiomDrain() });
 * ```
 *
 * On Vercel that is the first step and not the last: evlog fires drains as
 * floating promises and only awaits one when a `waitUntil` is threaded through,
 * which the `log.*` surface never does, so a lambda that freezes at response
 * time takes the in-flight `fetch` with it. The README says what to wire.
 */
export function initLogging(config: Parameters<typeof initLogger>[0] = {}) {
  // Pretty printing goes off as soon as a drain exists, unless the caller
  // insists. evlog's `log.info(tag, message)` path prints the one-line form and
  // returns *before* the drain runs — `emitTaggedLog` in
  // `evlog/dist/audit-*.mjs` — so with both switched on, every log that carries
  // no extra fields reaches the console and nothing else. A drain that quietly
  // drops the most common call shape is worse than a console without colours.
  //
  // It only bites in development, where `pretty` defaults on and there is
  // normally no drain. The combination is still one env var away, so it is
  // closed here rather than written down and forgotten.
  //
  // Plugins count: `drainPlugin` registers a drain that never appears on
  // `config.drain`. Erring towards JSON output costs colour; erring the other
  // way costs logs.
  const draining =
    config.drain !== undefined || (config.plugins?.length ?? 0) > 0;

  // Assigned, not spread — an explicit `pretty: undefined` would otherwise put
  // the hole straight back. With no drain, evlog's own NODE_ENV default stands;
  // CLI entry points want a better rule than that and get it from
  // `@workspace/logger/cli`, which is a separate module because reading
  // `process.stdout` is a build error in the edge runtime and this one is
  // bundled for it.
  initLogger(draining ? { ...config, pretty: config.pretty ?? false } : config);
}
