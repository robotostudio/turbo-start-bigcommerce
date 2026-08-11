import { env } from "@workspace/env/server";
import { initLogging } from "@workspace/logger";

/**
 * Next.js runs this once per server runtime, before anything else. It is the
 * one place the web app configures logging, which makes it the one place a log
 * drain gets added later:
 *
 * ```ts
 * import { createAxiomDrain } from "evlog/axiom";
 * initLogging({ env: { service: "web" }, drain: createAxiomDrain() });
 * ```
 *
 * Until then everything goes to stdout and stderr, and Vercel collects both.
 */
export function register() {
  initLogging({
    env: {
      service: "web",
      // evlog reads NODE_ENV and never looks at VERCEL_ENV, so without this a
      // preview deploy stamps every event `production`.
      environment: env.VERCEL_ENV ?? env.NODE_ENV,
    },
  });
}
