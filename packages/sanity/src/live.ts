import type { ContentSourceMap } from "@sanity/client";
import { env } from "@workspace/env/server";
import { Logger } from "@workspace/logger";
import type { StegaCleaned } from "next-sanity";
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

/**
 * The one cache tag every Sanity read carries, and the only handle
 * `/api/revalidate` has on the cache.
 *
 * next-sanity tags each cached fetch with `sanity:<syncTag>` per content hash
 * and nothing else (`dist/live/conditions/react-server/index.js`: `[...tags,
 * ...syncTags.map(...)]`). Those hashes are not document ids, so a webhook
 * payload cannot be mapped to them, and `tags` is empty unless a caller fills
 * it. Up to next-sanity 12 the library added a blanket `"sanity"` itself; 13
 * dropped it, which left `revalidateTag("sanity")` matching nothing and every
 * published change invisible in production until the next deploy.
 *
 * Added here rather than at each call site so a new `sanityFetch` cannot be
 * written without it. Prepended, not substituted: the `sanity:<hash>` tags are
 * what `<SanityLive />` revalidates for live preview, and they still come back
 * from the library untouched.
 */
export const SANITY_CACHE_TAG = "sanity";

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
const fetchWithFallback: typeof liveFetch = async (options) => {
  try {
    return await liveFetch({
      ...options,
      tags: [SANITY_CACHE_TAG, ...(options.tags ?? [])],
    });
  } catch (error) {
    if (!isUnreachable(error)) {
      throw error;
    }
    warnOnce(options.query, error);
    return { data: null as never, sourceMap: null, tags: [] };
  }
};

/**
 * next-sanity 13 brands every string in a stega-enabled fetch as
 * `StegaString`, so that comparing one to a literal is a type error rather
 * than a silent mismatch on the invisible characters stega adds.
 *
 * We unbrand it here, at the one choke point every read goes through, which
 * keeps the generated GROQ result types — the ones every component prop is
 * typed against — as the shape callers receive. The runtime is untouched:
 * stega stays on, so Presentation Tool overlays keep working, and the two
 * places that do compare a fetched string to a literal (`hero.tsx`,
 * `json-ld.tsx`) already call `stegaClean` themselves.
 *
 * The alternative is branded types everywhere and a `stegaClean` at every
 * comparison. Worth revisiting if a stega mismatch ever ships; today it would
 * be a wide diff bought with no bug it catches.
 */
type CleanFetch = <const QueryString extends string>(
  ...args: Parameters<typeof liveFetch<QueryString>>
) => Promise<{
  data: StegaCleaned<
    Awaited<ReturnType<typeof liveFetch<QueryString>>>["data"]
  >;
  sourceMap: ContentSourceMap | null;
  tags: string[];
}>;

export const sanityFetch = fetchWithFallback as CleanFetch;

/**
 * Spread into a `sanityFetch` for a surface that is never a preview: the
 * sitemap, llms.txt, the Markdown views, the OG images. Each is a machine-read
 * artifact served to crawlers and agents, so a draft-mode session must not
 * change what it says, and the invisible characters stega adds have nowhere to
 * be clicked — in a URL or a rendered PNG they are corruption, not an overlay.
 *
 * Pages and shared chrome deliberately do not use this. Their whole point is
 * that the Presentation Tool can show an editor their unpublished work.
 */
export const PUBLISHED = { perspective: "published", stega: false } as const;
