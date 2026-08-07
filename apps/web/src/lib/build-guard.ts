import { Logger } from "@workspace/logger";

const logger = new Logger("BuildGuard");

/** One warning per source per process, so the first real failure stays visible. */
const warned = new Set<string>();

/**
 * Runs a build-time content fetch, degrading to `fallback` instead of failing
 * the whole build when it throws: no Sanity project on a fresh clone, or a
 * flaky network in CI.
 *
 * Use this for direct `client.fetch` calls. `sanityFetch` already degrades on
 * its own — see `packages/sanity/src/live.ts` — so wrapping that a second time
 * only swallows the errors it deliberately re-throws.
 *
 * `consequence` names what this particular caller loses, so a production build
 * that quietly stopped prerendering is obvious in the log rather than silent.
 */
export async function fetchOrFallback<T>(
  source: string,
  consequence: string,
  fetcher: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await fetcher();
  } catch (error) {
    if (!warned.has(source)) {
      warned.add(source);
      const cause = error instanceof Error ? error.message : String(error);
      logger.warn(
        `Could not fetch ${source}. The build is CONTINUING, but ${consequence}. Cause: ${cause}`
      );
    }
    return fallback;
  }
}
