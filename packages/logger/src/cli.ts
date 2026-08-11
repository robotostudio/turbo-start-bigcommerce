import { initLogging } from "./index";

/**
 * Logging setup for a command someone runs in a terminal — `seed`, `sync`,
 * `verify`, the studio scripts.
 *
 * Its own module, and its own export path, because of one line: reading
 * `process.stdout` is a build error in the Edge runtime, and `./index.ts` is
 * bundled for it. Nothing on the edge imports this file.
 *
 * ```ts
 * import { initCliLogging } from "@workspace/logger/cli";
 * initCliLogging();
 * ```
 */
export function initCliLogging(config: Parameters<typeof initLogging>[0] = {}) {
  // Pretty when a person is watching, JSON when they are not.
  //
  // evlog decides this from NODE_ENV, which is the wrong question here: it is
  // "development" for every one of these commands, so pretty mode is always on,
  // and pretty mode writes every level to stdout through `console.log`. That
  // means `pnpm seed > seed.log` fills the file with `^[[31m` and `pnpm verify
  // 2>errors` catches nothing. `isTTY` asks what actually matters, and agrees
  // with NODE_ENV in both cases evlog gets right.
  initLogging({ pretty: Boolean(process.stdout?.isTTY), ...config });
}
