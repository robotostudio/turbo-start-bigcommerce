import { env } from "@workspace/env/server";
import { Logger } from "@workspace/logger";
import { defineLive } from "next-sanity/live";

import { client } from "./client";

/**
 * Use defineLive to enable automatic revalidation and refreshing of your fetched content
 * Learn more: https://github.com/sanity-io/next-sanity?tab=readme-ov-file#1-configure-definelive
 */

const { sanityFetch: liveFetch, SanityLive } = defineLive({
  client,
  // Required for showing draft content when the Sanity Presentation Tool is used, or to enable the Vercel Toolbar Edit Mode
  serverToken: env.SANITY_API_READ_TOKEN,
  // Required for stand-alone live previews, the token is only shared to the browser if it's a valid Next.js Draft Mode session
  browserToken: env.SANITY_API_READ_TOKEN,
});

export { SanityLive };

const logger = new Logger("sanity");

/** Socket-level failures: no HTTP response came back at all. */
const NETWORK_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "ENOTFOUND",
  "EPIPE",
  "ESOCKETTIMEDOUT",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

/**
 * True when the Content Lake did not answer us: unreachable host, wrong
 * project, bad token, or Sanity itself being down. In all of those the right
 * thing to render is the no-content state every caller already has.
 *
 * Deliberately narrow. A 400 is a malformed GROQ query, and a `TypeError` is a
 * bug in this repo; both keep throwing, because rendering an empty page would
 * hide them.
 */
function isUnreachable(error: unknown): boolean {
  const candidate = error as {
    statusCode?: unknown;
    code?: unknown;
    isNetworkError?: unknown;
  } | null;

  const status = candidate?.statusCode;
  if (typeof status === "number") {
    return status === 401 || status === 403 || status === 404 || status >= 500;
  }

  // `get-it`, the transport under @sanity/client, flags every socket-level
  // failure with this. It is a more reliable signal than the error code, which
  // a connect timeout does not always carry.
  if (candidate?.isNetworkError === true) {
    return true;
  }

  return (
    typeof candidate?.code === "string" &&
    NETWORK_ERROR_CODES.has(candidate.code)
  );
}

/** One warning per query per process; a dummy-env build fails every read. */
const warnedQueries = new Set<string>();

function warnOnce(query: string, error: unknown) {
  if (warnedQueries.has(query)) {
    return;
  }
  warnedQueries.add(query);
  const cause = error instanceof Error ? error.message : String(error);
  const preview = query.replace(/\s+/g, " ").slice(0, 80);
  logger.warn(
    `Content Lake unreachable, rendering empty content for: ${preview}... Cause: ${cause}`
  );
}

/**
 * `sanityFetch`, but an unreachable Content Lake degrades to empty content
 * instead of throwing.
 *
 * This is what lets a fresh clone build with no Sanity project, which is the
 * state every new contributor starts in. It is also the right behaviour in
 * production, where one Sanity outage would otherwise fail every route at once
 * rather than serving pages in their empty state.
 *
 * The `as never` is the one type compromise. `data` is generic over each
 * query's own result type, so there is no single honest value to return here.
 * `never` says "no value", and the branch is reachable only when there is
 * genuinely no content to be had. Callers already handle that, because the
 * generated GROQ result types are nullable and TypeScript has been forcing
 * them to.
 */
export const sanityFetch: typeof liveFetch = async (options) => {
  try {
    return await liveFetch(options);
  } catch (error) {
    if (!isUnreachable(error)) {
      throw error;
    }
    warnOnce(options.query, error);
    return { data: null as never, sourceMap: null, tags: [] };
  }
};
