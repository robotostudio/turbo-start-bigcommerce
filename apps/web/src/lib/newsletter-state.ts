/**
 * The state the newsletter forms render, kept out of `app/actions.ts` on
 * purpose.
 *
 * Every export of a `"use server"` module is rewritten into a server
 * reference — Next does not restrict that to functions, it just replaces them
 * all. A plain constant exported from there therefore reaches both the SSR and
 * the browser bundle as a callable proxy rather than as its value, so
 * `useActionState(action, initialState)` would start life holding a function
 * and `state.status` would be `undefined` on first render. Anything a client
 * component needs as a *value* has to live in a normal module like this one.
 *
 * `email` is echoed back on failure so a no-JS submission — which discards the
 * client-side DOM entirely and re-renders from the server — can put the
 * shopper's address back in the field instead of making them retype it.
 */
export type NewsletterState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string; email?: string };

export const newsletterInitialState: NewsletterState = { status: "idle" };
