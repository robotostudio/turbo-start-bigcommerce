import { initLog, log } from "evlog/client";

import { makeLogger } from "./core";

/**
 * The browser build of this package. `package.json` routes the `browser`
 * export condition here so a client component importing `@workspace/logger`
 * — `preview-bar.tsx`, for one — gets evlog's browser bundle instead of the
 * server one, which expects `process` and Node globals.
 *
 * The API matches `./index.ts` deliberately, so the swap is invisible to
 * callers. Types always come from `./index.ts`; conditions only steer runtime
 * resolution.
 */
export const Logger = makeLogger(log);
export type Logger = InstanceType<typeof Logger>;

export { toEvent } from "./core";

export function initLogging(options: Parameters<typeof initLog>[0] = {}) {
  initLog(options);
}
