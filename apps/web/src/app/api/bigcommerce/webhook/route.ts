import { env } from "@workspace/env/server";
import { Logger } from "@workspace/logger";
import {
  deleteCategory,
  deleteProduct,
  syncCategory,
  syncProduct,
} from "@workspace/sanity-sync/sync";

import {
  claimDelivery,
  releaseDelivery,
  routeEvent,
  secretMatches,
  type SyncAction,
} from "@/lib/bigcommerce/webhook";

/**
 * The BigCommerce catalog webhook receiver — the only thing that keeps Sanity's
 * synced catalog documents in step with the store. Design: `docs/sync-design.md`,
 * amended by ROB-2611, ROB-2613 and ROB-2614; captured traffic:
 * `docs/research/09-webhook-payloads.md`.
 *
 * Node, not edge: `crypto.timingSafeEqual` and the Admin REST token both need it.
 */
export const runtime = "nodejs";

const logger = new Logger("BigCommerceWebhook");

const SYNC: Record<
  SyncAction,
  (entityId: number, options: { write: true }) => Promise<unknown>
> = { syncProduct, deleteProduct, syncCategory, deleteCategory };

/**
 * How long the handler will wait for a sync before it gives up and answers 500.
 *
 * **BigCommerce's ACK timeout is between 9 and 12 seconds**, measured against
 * store `8jbhprizry` on 2026-08-11 by holding real deliveries open for a fixed
 * time and watching for a redelivery of the same `hash`. Holds of 5s and 9s
 * were never redelivered; 12s and 30s always were, each retried about 71
 * seconds after the first attempt. Method and raw log in
 * `docs/research/09-webhook-payloads.md`.
 *
 * Eight seconds sits under the low end of that range with a second to spare. It
 * is deliberately not 9: the boundary is bracketed, not pinned, and the cost of
 * being wrong is asymmetric. Too high and BigCommerce gives up on a sync that
 * was about to succeed, then redelivers it, so the work happens twice. Too low
 * and we return 500 on a slow-but-fine sync and it is retried once.
 *
 * For scale: a real `syncProduct` of product 180 — one Admin REST GET, one GROQ
 * fetch, 12 mutations — took 2.3s to 3.7s against a `next dev` server on a
 * laptop, and the 404 paths took 0.4s to 0.9s. Production should be well under
 * a second. Do not raise this past 9s without re-measuring; the timeout is a
 * BigCommerce-side number and nothing stops them changing it.
 *
 * Giving up does not cancel the sync; it stops waiting for it. The abandoned
 * work is harmless: `client.mutate` sends one transaction, and every sync
 * function re-fetches the entity and writes whole rather than a delta, so the
 * retry that follows converges on the same state.
 */
const SYNC_TIMEOUT_MS = 8000;

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`sync did not finish within ${ms}ms`)),
          ms
        );
      }),
    ]);
  } finally {
    // The loser keeps the function alive until it fires otherwise.
    clearTimeout(timer);
  }
}

export async function POST(request: Request): Promise<Response> {
  if (
    !secretMatches(
      request.headers.get("x-bigcommerce-webhook-secret"),
      env.BIGCOMMERCE_WEBHOOK_SECRET
    )
  ) {
    logger.warn("rejected a delivery with a missing or wrong secret");
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    logger.warn("authenticated delivery with a body that is not JSON");
    return new Response("Ignored", { status: 200 });
  }

  const { hash, scope } = (payload ?? {}) as {
    hash?: unknown;
    scope?: unknown;
  };
  const route = routeEvent(payload);

  if (route.action === "ignore") {
    // 200 on purpose. A 4xx counts as a failed delivery, and eleven failures
    // deactivate the hook — over an event this receiver was never going to act
    // on. See `routeEvent`.
    logger.info(`ignored: ${route.reason}`);
    return new Response("Ignored", { status: 200 });
  }

  const deliveryId =
    typeof hash === "string" && hash.length > 0
      ? hash
      : (request.headers.get("webhook-id") ?? null);

  if (deliveryId && !claimDelivery(deliveryId)) {
    logger.info(`${scope}: duplicate delivery ${deliveryId}, already claimed`);
    return new Response("Duplicate", { status: 200 });
  }

  try {
    await withTimeout(
      SYNC[route.action](route.entityId, { write: true }),
      SYNC_TIMEOUT_MS
    );
    logger.info(`${scope}: ${route.action}(${route.entityId}) ok`);
    return new Response("OK", { status: 200 });
  } catch (error) {
    // Hand the hash back before answering, or the retry finds it claimed,
    // answers 200, and the event is lost. The ladder — 60s, 180s, 300s, 600s,
    // 900s, 1800s, 3600s, 7200s, 21600s, 50400s, 86400s — is the only repair
    // this design has, since there is no scheduled sweep.
    if (deliveryId) releaseDelivery(deliveryId);

    logger.error(
      `${scope}: ${route.action}(${route.entityId}) failed`,
      error instanceof Error ? error.message : String(error)
    );
    return new Response("Sync failed", { status: 500 });
  }
}
