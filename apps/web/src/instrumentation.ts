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
 * Until then everything goes to stdout and Vercel collects it.
 */
export function register() {
  // Edge runs this too, and gets evlog's own defaults rather than this call.
  // It does reach the Node entry point: `@workspace/logger` maps `edge-light`
  // and `worker` ahead of `browser`, because the browser runtime opens with
  // `if (!isBrowser()) return` and would drop every edge log without a word.
  // `apps/web/src/proxy.ts` is a live edge bundle.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  initLogging({
    env: {
      service: "web",
      // evlog reads NODE_ENV and never looks at VERCEL_ENV, so without this a
      // preview deploy stamps every event `production`.
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    },
  });
}
