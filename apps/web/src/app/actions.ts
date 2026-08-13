"use server";

import { Logger } from "@workspace/logger";
import { draftMode } from "next/headers";
import { z } from "zod";

import type { NewsletterState } from "@/lib/newsletter-state";

const logger = new Logger("AppActions");

const DISABLE_DELAY = 1000;

export async function disableDraftMode() {
  const disable = (await draftMode()).disable();
  const delay = new Promise((resolve) => setTimeout(resolve, DISABLE_DELAY));
  await Promise.allSettled([disable, delay]);
}

// `NewsletterState` and `newsletterInitialState` live in
// `@/lib/newsletter-state` rather than here: Next rewrites *every* export of a
// `"use server"` module into a server reference, so a constant exported from
// this file would reach the forms as a callable proxy instead of its value.

// `type="email"` and `required` are a hint to the browser, not a guarantee: a
// no-JS POST, a scripted client or an older browser can all put anything in
// this field, so the server re-checks before the address goes anywhere.
const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address")
  .max(254, "That email address is too long")
  .pipe(z.email("Enter a valid email address"));

/**
 * Subscribes an address to the newsletter.
 *
 * Deliberately a server action rather than a fetch from a click handler: bound
 * to `<form action>`, Next ships a hidden action-id field in the server HTML,
 * so the form posts and this runs even with JavaScript disabled. The returned
 * state comes back through the re-render either way, which is what lets both
 * newsletter forms report success or failure without hydration.
 */
export async function subscribeToNewsletter(
  _prevState: NewsletterState,
  formData: FormData
): Promise<NewsletterState> {
  const raw = formData.get("email");
  const submitted = typeof raw === "string" ? raw : "";
  const parsed = emailSchema.safeParse(submitted);

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Enter a valid email address",
      email: submitted,
    };
  }

  // TODO: hand the address to the email provider here — the Klaviyo
  // `/api/profile-subscription-bulk-create-jobs` call, the Mailchimp
  // `/lists/{id}/members` call, or whichever list the client ends up on. This
  // starter deliberately ships no provider integration, so the subscription is
  // only recorded in the server log; wire the call in and map its failures
  // onto the `error` branch above.
  logger.info(`Newsletter subscription: ${parsed.data}`);

  return {
    status: "success",
    message: "Thanks — you're subscribed.",
  };
}
