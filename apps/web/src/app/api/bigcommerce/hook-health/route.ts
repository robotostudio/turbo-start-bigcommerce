import { env } from "@workspace/env/server";
import { Logger } from "@workspace/logger";

import {
  type BigCommerceHook,
  diffHooks,
  type HookHealth,
  REQUIRED_HOOK_SCOPES,
} from "@/lib/bigcommerce/hook-health";

/**
 * Notices when a catalog webhook has gone dark.
 *
 * BigCommerce deactivates a hook after roughly 48 hours of cumulative failure
 * and emails the API account's owner. Nothing else in this design notices:
 * ROB-2611 has the receiver answer 500 so BigCommerce retries, which is the
 * repair mechanism, but a sustained outage spends that same 48-hour budget and
 * kills the hook at the end of it. There is no reconcile sweep behind that by
 * decision (ROB-2608), so once a hook is off, the catalog stops reaching
 * Sanity and no error is raised anywhere, indefinitely.
 *
 * A cron hits this once a day. `is_active` is a binary that flips at the end
 * of the retry ladder, so no poll can warn before a hook dies — the honest
 * claim is that a dead hook is noticed within 24 hours of dying, and the way
 * to shorten that is the schedule in `vercel.json`, not this file.
 *
 * It alerts and does not re-arm, which is the decision most worth writing
 * down. Flipping `is_active` back costs one PUT, and it is the wrong move
 * twice over. A hook that a real outage killed will fail its way back to
 * deactivated, so re-arming buys 48 hours of looking fine and hides the
 * outage. And a *missing* hook cannot be re-armed at all — recreating one
 * means re-supplying the shared-secret header it authenticates with, which is
 * registration, not repair. A human decides; this route makes sure one is
 * told.
 */

const logger = new Logger("hook-health");

const ADMIN_API = "https://api.bigcommerce.com/stores";

/** The API's maximum. Nine hooks per destination, and a store carries several. */
const PAGE_LIMIT = 250;

type HooksResponse = {
  data: BigCommerceHook[];
  meta?: { pagination?: { total?: number } };
};

/**
 * Only returns hooks created by the presented token's API account. A token
 * from a different account answers 200 with an empty list, which `diffHooks`
 * reads as nine missing rather than as healthy.
 */
async function listHooks(): Promise<BigCommerceHook[]> {
  const response = await fetch(
    `${ADMIN_API}/${env.BIGCOMMERCE_STORE_HASH}/v3/hooks?limit=${PAGE_LIMIT}`,
    {
      headers: {
        "X-Auth-Token": env.BIGCOMMERCE_ADMIN_TOKEN,
        Accept: "application/json",
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      `GET /v3/hooks failed: ${response.status} ${response.statusText}`
    );
  }

  const body = (await response.json()) as HooksResponse;
  const total = body.meta?.pagination?.total ?? body.data.length;

  // A truncated page would report the hooks it did not fetch as missing. That
  // is a false alarm rather than a silent miss, but it is still wrong, and at
  // this limit it means the store has more hooks than anyone expects.
  if (body.data.length < total) {
    throw new Error(
      `GET /v3/hooks returned ${body.data.length} of ${total} hooks; raise the page limit`
    );
  }

  return body.data;
}

/**
 * Best effort by design: a failed alert must not swallow the 500 that makes
 * the cron run itself go red, so nothing here throws.
 */
async function postAlert(text: string): Promise<void> {
  const url = env.HOOK_HEALTH_ALERT_WEBHOOK_URL;
  if (!url) {
    return;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      logger.error(
        `Alert webhook rejected the message: ${response.status} ${response.statusText}`
      );
    }
  } catch (error) {
    logger.error("Alert webhook could not be reached.", error);
  }
}

function describe(health: HookHealth): string {
  const parts: string[] = [];
  if (health.missing.length > 0) {
    parts.push(`missing: ${health.missing.join(", ")}`);
  }
  if (health.inactive.length > 0) {
    parts.push(`deactivated: ${health.inactive.join(", ")}`);
  }
  return parts.join(" | ");
}

export async function GET(request: Request) {
  // Vercel attaches this header to cron invocations by itself. Plain
  // comparison rather than a constant-time one: the secret is not derived from
  // anything the caller sent, so there is no digest to walk a byte at a time.
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    logger.warn("Rejected a hook-health request with no valid cron secret.");
    return Response.json({ status: "unauthorized" }, { status: 401 });
  }

  const destination = env.BIGCOMMERCE_WEBHOOK_DESTINATION;

  let hooks: BigCommerceHook[];
  try {
    hooks = await listHooks();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.error(`Could not read the store's webhooks: ${reason}`);
    // Distinct from an unhealthy answer on purpose. This one says the check
    // did not run, so the hooks may be fine and nobody knows.
    await postAlert(
      `BigCommerce hook health check could not run: ${reason}. Hook state is unknown.`
    );
    return Response.json({ status: "check-failed", reason }, { status: 500 });
  }

  const health = diffHooks(hooks, destination);

  if (health.healthy) {
    logger.info(
      `All ${REQUIRED_HOOK_SCOPES.length} catalog webhooks are active on ${destination}.`
    );
    return Response.json({ status: "healthy", ...health });
  }

  const summary = describe(health);
  logger.error(`Catalog webhooks are not delivering — ${summary}.`);
  await postAlert(
    `BigCommerce catalog webhooks are not delivering to ${destination} — ${summary}. The catalog has stopped syncing into Sanity. Re-register or re-enable them, and check why the receiver was failing first.`
  );

  // 500 so the cron run itself is red wherever runs are listed, not just a
  // line in a log somebody would have to go looking for.
  return Response.json({ status: "unhealthy", ...health }, { status: 500 });
}
