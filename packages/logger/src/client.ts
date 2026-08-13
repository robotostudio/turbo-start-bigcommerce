import { log } from "evlog/client";

import { makeLogger } from "./core";

/**
 * The browser build of this package. `package.json` routes the `browser` export
 * condition here so a client component importing `@workspace/logger` —
 * `preview-bar.tsx`, for one — gets evlog's browser bundle instead of the
 * server one, which expects `process` and Node globals.
 *
 * `edge-light` and `worker` are mapped ahead of `browser` and do *not* land
 * here: evlog's browser runtime starts with `if (!isBrowser()) return`, so an
 * edge bundle resolving to this file would drop every log without an error.
 *
 * No `initLogging`. The browser build has no drain — only a `transport` that
 * POSTs to an ingest route this repo does not have — and `types` resolves to
 * `./index.ts` for every condition, so exporting a same-named function here
 * would type-check against the server's `LoggerConfig` and quietly do nothing
 * with it. Client logs are console-only, and that is the honest surface.
 */
export const Logger = makeLogger(log);
export type Logger = InstanceType<typeof Logger>;
