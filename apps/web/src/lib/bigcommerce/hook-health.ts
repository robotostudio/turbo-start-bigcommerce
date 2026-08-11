/**
 * Which BigCommerce webhooks should exist, and how to tell that they don't.
 *
 * BigCommerce retries a failing endpoint at 60, 180, 300, 600, 900, 1800,
 * 3600, 7200, 21600, 50400 and 86400 seconds, and after roughly 48 hours of
 * cumulative failure it sets the hook `is_active: false` and emails whoever
 * owns the API account. A deactivated hook fails silently and forever: the
 * catalog stops syncing into Sanity, nothing throws, and the storefront keeps
 * serving whatever the last successful delivery wrote. There is no scheduled
 * reconcile sweep behind this (ROB-2608 ruled one out), so a poll of
 * `GET /v3/hooks` is the only thing that notices.
 *
 * Two shapes of failure, not one. A hook can be present and switched off, or
 * gone entirely — deleted by hand, or registered against a destination that no
 * longer exists. Both read as "no deliveries" from here.
 *
 * Split out of the route so the comparison can be tested without a store, a
 * token or a request.
 */

/**
 * The nine scopes ROB-2613 settled on: product, category and sku, each
 * created/updated/deleted.
 *
 * `sku` is not optional garnish. A variant edit fires `store/sku/*` and
 * nothing else — no `store/product/updated` rides along — so without these
 * three a price change on a variant never reaches Sanity. Inventory, option
 * and modifier scopes are deliberately absent: nothing in
 * `packages/sanity-sync` reads those fields.
 */
export const REQUIRED_HOOK_SCOPES = [
  "store/product/created",
  "store/product/updated",
  "store/product/deleted",
  "store/category/created",
  "store/category/updated",
  "store/category/deleted",
  "store/sku/created",
  "store/sku/updated",
  "store/sku/deleted",
] as const;

/** The fields of `GET /v3/hooks` this check reads. The response carries more. */
export type BigCommerceHook = {
  scope: string;
  destination: string;
  is_active: boolean;
};

export type HookHealth = {
  /** Required scopes with no hook at all pointing at our receiver. */
  missing: string[];
  /** Required scopes whose hook exists but has been switched off. */
  inactive: string[];
  healthy: boolean;
};

/**
 * A trailing slash is the difference between two spellings of one URL, not
 * between two endpoints. Comparing them raw makes the check report nine
 * missing hooks every day, which trains whoever reads the alert to ignore it.
 */
function normalizeDestination(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * Compare the hooks BigCommerce reports against the nine that should exist.
 *
 * Matched on destination, not on scope alone. The same store carries hooks for
 * local development through a tunnel (BigCommerce will not call `localhost`),
 * and those cover the same nine scopes. Counting a developer's tunnel hook as
 * proof that production is wired is exactly the silence this check exists to
 * break — as of writing, the live store's nine hooks all point at a
 * `trycloudflare.com` URL, and only four of them are scopes we need.
 *
 * An empty list therefore reads as nine missing rather than as healthy, which
 * also covers the case where the polling token belongs to a different API
 * account than the one that registered the hooks: `GET /v3/hooks` only returns
 * hooks owned by the presented token's client id.
 */
export function diffHooks(
  hooks: readonly BigCommerceHook[],
  destination: string
): HookHealth {
  const target = normalizeDestination(destination);

  const active = new Map<string, boolean>();
  for (const hook of hooks) {
    if (normalizeDestination(hook.destination) !== target) {
      continue;
    }
    // Duplicates at one destination are possible (registration is nine
    // separate POSTs, and a re-run makes a second set). One live hook
    // delivers, so active wins over inactive.
    active.set(hook.scope, (active.get(hook.scope) ?? false) || hook.is_active);
  }

  const missing: string[] = [];
  const inactive: string[] = [];

  for (const scope of REQUIRED_HOOK_SCOPES) {
    const isActive = active.get(scope);
    if (isActive === undefined) {
      missing.push(scope);
    } else if (!isActive) {
      inactive.push(scope);
    }
  }

  return {
    missing,
    inactive,
    healthy: missing.length === 0 && inactive.length === 0,
  };
}
