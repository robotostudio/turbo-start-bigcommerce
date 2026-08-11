import { timingSafeEqual } from "node:crypto";

/**
 * Everything `/api/bigcommerce/webhook` decides before it touches the network.
 *
 * Kept out of the route file because a Next route module may only export the
 * HTTP verbs and a handful of config names — anything else fails the build's
 * route type check — and these three decisions are the ones worth testing:
 * which secret is accepted, which entity a payload names, and whether a
 * delivery has already been claimed.
 *
 * Every shape here comes from real captured traffic against store
 * `8jbhprizry`, recorded in `docs/research/09-webhook-payloads.md` (ROB-2612).
 * Nothing is inferred from BigCommerce's documentation.
 */

export type SyncAction =
  | "syncProduct"
  | "deleteProduct"
  | "syncCategory"
  | "deleteCategory";

export type WebhookRoute =
  | { action: SyncAction; entityId: number }
  /** Answer 200 and do nothing. `reason` is for the log line. */
  | { action: "ignore"; reason: string };

/**
 * Constant-time comparison of the `x-bigcommerce-webhook-secret` header.
 *
 * The length check is not an optimisation: `timingSafeEqual` throws on buffers
 * of different lengths, so without it a wrong-length guess produces a 500
 * instead of a 401. Length does leak, which is not worth defending — the secret
 * is a fixed-width `openssl rand -hex 32` string and its length is public.
 *
 * Never authenticate on the payload's `hash` field. It is an unkeyed SHA-1 of
 * the body, so anyone who can reach this route can compute a valid one, and
 * accepting it would hand out a write endpoint into the CMS.
 */
export function secretMatches(
  received: string | null | undefined,
  expected: string
): boolean {
  if (!received) return false;

  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

/** BigCommerce entity ids are positive integers; anything else is malformed. */
function entityId(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function route(
  action: SyncAction,
  id: number | null,
  at: string
): WebhookRoute {
  return id === null
    ? { action: "ignore", reason: `no usable entity id at ${at}` }
    : { action, entityId: id };
}

/**
 * Which sync function a delivery calls, and with which id.
 *
 * **The id is not in the same place on every scope, and there is no generic
 * `data.id` extractor to be had.** A product event carries
 * `data: {type, id}`. A sku event carries
 * `data: {type, id, sku: {product_id, variant_id}}`, and its `data.id` is the
 * `sku_id` — a different number from the variant id, on the same variant.
 * Verbatim, from the capture:
 *
 * ```json
 * {"scope":"store/sku/updated","data":{"type":"sku","id":145,"sku":{"product_id":180,"variant_id":167}}}
 * ```
 *
 * Sanity variant documents live at `bigcommerceProductVariant-{variant.id}`,
 * which is 167. Reading `data.id` writes `bigcommerceProductVariant-145`: a
 * document that resolves to nothing, joins to nothing, and throws nothing.
 * Both numbers are real, so no layer below this one can catch the mistake.
 *
 * All three sku scopes route to `syncProduct` on `data.sku.product_id`, because
 * the sync writes a product and its variants as one unit — including the
 * deleted case, where `syncProduct` soft-deletes the variants Sanity holds that
 * the product no longer lists.
 *
 * An unrecognised scope, and a recognised scope whose id is missing or
 * malformed, both come back as `ignore`. The caller answers 200 to those: a 4xx
 * counts as a failed delivery against BigCommerce's retry policy, and eleven
 * retries of a payload that will never parse ends with the hook deactivated.
 */
export function routeEvent(payload: unknown): WebhookRoute {
  const event = payload as { scope?: unknown; data?: unknown } | null;
  const scope = typeof event?.scope === "string" ? event.scope : null;
  if (!scope) {
    return { action: "ignore", reason: "payload has no scope" };
  }

  const data = (event?.data ?? {}) as {
    id?: unknown;
    sku?: { product_id?: unknown } | null;
  };

  switch (scope) {
    case "store/product/created":
    case "store/product/updated":
      return route("syncProduct", entityId(data.id), "data.id");

    case "store/product/deleted":
      return route("deleteProduct", entityId(data.id), "data.id");

    case "store/category/created":
    case "store/category/updated":
      return route("syncCategory", entityId(data.id), "data.id");

    case "store/category/deleted":
      return route("deleteCategory", entityId(data.id), "data.id");

    case "store/sku/created":
    case "store/sku/updated":
    case "store/sku/deleted":
      // data.id here is the sku_id. See the doc comment above before changing.
      return route(
        "syncProduct",
        entityId(data.sku?.product_id),
        "data.sku.product_id"
      );

    default:
      return { action: "ignore", reason: `unregistered scope ${scope}` };
  }
}

/**
 * There is deliberately no deduplication here. See ROB-2618 and the comment in
 * `route.ts`: a per-instance claim never fired in production, because the
 * copies of one event arrive 20ms apart and land on separate lambdas. Catching
 * them needs shared state and a new service, to save two idempotent calls.
 */
