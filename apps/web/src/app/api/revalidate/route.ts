import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@workspace/env/server";
import { Logger } from "@workspace/logger";
import { SANITY_CACHE_TAG } from "@workspace/sanity/live";
import { revalidateTag } from "next/cache";

/**
 * The Sanity revalidation receiver.
 *
 * Without this route the Sanity half of the site is not connected at all.
 * `defineLive`'s `sanityFetch` sets `revalidate: false` in production
 * (`next-sanity/dist/live.js`), so every Sanity-backed fetch is cached until
 * something invalidates its tag by name — and nothing did. A publish reached
 * the Content Lake instantly and the built pages served the old content
 * indefinitely: verified by polling `/` every 5s for 453s after a publish and
 * never seeing the change.
 *
 * Sibling of `api/bigcommerce/webhook` (see `docs/sync-design.md`): Node
 * runtime, authenticate in constant time, answer fast. It differs in one way
 * that matters — BigCommerce sends a shared secret in a header, Sanity signs
 * the body, so this verifies an HMAC rather than comparing a token.
 *
 * The tag it clears, `SANITY_CACHE_TAG`, is imported from the `sanityFetch`
 * wrapper rather than repeated here, because a copy that drifts from the
 * wrapper fails silently: `revalidateTag` matches nothing and still answers
 * 200. next-sanity's own tags are `sanity:<syncTag>`, one per content hash
 * (`s1:9x+Q0Q`), and those are not document ids — the webhook payload knows
 * `_id`, and no `_id` appears in any tag — so the blanket tag is the only
 * handle a webhook has. Blunt: one publish clears the cache for all Sanity
 * content, not just the document that changed. Correct, though, and the
 * alternative is a per-document tag scheme that every call site would have to
 * opt into and keep in step. Give a route its own tag before optimising this.
 */

// Not edge: `node:crypto`'s `timingSafeEqual` needs Node.
export const runtime = "nodejs";

const logger = new Logger("revalidate");

/** Bounds replay of a captured request without needing to store nonces. */
const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;

type ParsedSignature = { timestamp: number; signature: string };

/**
 * Sanity's `sanity-webhook-signature` header is `t=<ms>,v1=<base64url>`, where
 * the signed message is `${t}.${rawBody}`. Order is not guaranteed, so the
 * parts are read by name rather than by position.
 */
function parseSignatureHeader(header: string | null): ParsedSignature | null {
  if (!header) {
    return null;
  }

  let timestamp: number | null = null;
  let signature: string | null = null;

  for (const part of header.split(",")) {
    const [key, value] = part.trim().split("=", 2);
    if (key === "t" && value) {
      const parsed = Number(value);
      timestamp = Number.isFinite(parsed) ? parsed : null;
    }
    if (key === "v1" && value) {
      signature = value;
    }
  }

  return timestamp !== null && signature ? { timestamp, signature } : null;
}

function isValidSignature(
  rawBody: string,
  header: string | null,
  secret: string
): boolean {
  const parsed = parseSignatureHeader(header);
  if (!parsed) {
    return false;
  }

  // Checked before the HMAC so a stale replay is rejected even if the
  // attacker holds a genuine past signature.
  if (Math.abs(Date.now() - parsed.timestamp) > MAX_SIGNATURE_AGE_MS) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${parsed.timestamp}.${rawBody}`)
    .digest("base64url");

  const presented = Buffer.from(parsed.signature);
  const computed = Buffer.from(expected);

  // `timingSafeEqual` throws on a length mismatch, so length is compared
  // first. That leaks the digest length, which is a fixed constant here and
  // therefore no leak at all; a byte-at-a-time content comparison would be.
  return (
    presented.length === computed.length && timingSafeEqual(presented, computed)
  );
}

export async function POST(request: Request) {
  // No missing-secret branch. `SANITY_REVALIDATE_SECRET` is required by the env
  // schema, so a process that got this far has one — an unset secret fails
  // validation at startup, where the message can say what to do about it,
  // rather than answering 503 into a log for the life of the deployment.
  const secret = env.SANITY_REVALIDATE_SECRET;

  const rawBody = await request.text();

  if (
    !isValidSignature(
      rawBody,
      request.headers.get("sanity-webhook-signature"),
      secret
    )
  ) {
    logger.warn("Rejected a webhook with a missing or invalid signature.");
    return Response.json(
      { revalidated: false, reason: "invalid-signature" },
      { status: 401 }
    );
  }

  // Only for the log line. A payload that does not parse is still a
  // correctly signed request, so it still revalidates.
  let describe = "unknown document";
  try {
    const payload = JSON.parse(rawBody) as { _id?: string; _type?: string };
    if (payload._type || payload._id) {
      describe = `${payload._type ?? "document"} ${payload._id ?? ""}`.trim();
    }
  } catch {
    // Leave the fallback description in place.
  }

  // No `after()` here, unlike the BigCommerce receiver: that one makes two or
  // three API round trips, this one flips an in-process cache flag. Deferring
  // it would add a failure mode that cannot be retried and buy nothing.
  //
  // `{ expire: 0 }` rather than the `"max"` profile Next's deprecation notice
  // suggests. Both invalidate the tag, but a named profile is resolved against
  // `cacheLifeProfiles` and permits a stale serve while revalidating; a
  // publish should be visible on the very next request, and an inline config
  // cannot quietly resolve to a profile this app never defined.
  revalidateTag(SANITY_CACHE_TAG, { expire: 0 });
  logger.info(`Revalidated "${SANITY_CACHE_TAG}" after ${describe} changed.`);

  return Response.json({ revalidated: true, tag: SANITY_CACHE_TAG });
}
