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
 * It exists so that adding a log drain later is one edit in one file rather
 * than a new dependency in every app. When that day comes:
 *
 * ```ts
 * import { createAxiomDrain } from "evlog/axiom";
 * initLogging({ drain: createAxiomDrain() });
 * ```
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

  // Otherwise: pretty when a person is watching, JSON when they are not.
  //
  // evlog decides this from NODE_ENV, which is the wrong question. It is right
  // about Vercel and about `next dev`, and wrong about every CLI script here:
  // `pnpm seed > seed.log` fills the file with `^[[31m`, and `pnpm verify
  // 2>errors` captures nothing, because pretty mode writes every level to
  // stdout through `console.log`. `isTTY` asks the question that actually
  // matters, and answers the same as NODE_ENV in both cases evlog got right.
  //
  // `?.` because the edge runtime has a `process` with no `stdout`.
  const pretty =
    config.pretty ?? (draining ? false : Boolean(process.stdout?.isTTY));

  // Assigned, not spread — an explicit `pretty: undefined` would otherwise put
  // the drain hole straight back.
  initLogger({ ...config, pretty });
}
