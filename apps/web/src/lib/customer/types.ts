/**
 * The signed-in customer, as the app models it. Separate from `auth.ts` so a
 * client component can name these types without importing server-only code.
 */

export type Customer = {
  entityId: number;
  firstName: string;
  lastName: string;
  email: string;
};

export type CustomerErrorCode =
  /** Wrong email or password. BigCommerce does not say which, and neither do we. */
  | "INVALID_CREDENTIALS"
  | "EMAIL_IN_USE"
  /** The merchant has account creation switched off in the BigCommerce admin. */
  | "REGISTRATION_DISABLED"
  | "INVALID_INPUT"
  | "NETWORK"
  | "UNKNOWN";

export type CustomerError = {
  code: CustomerErrorCode;
  message: string;
};

export type CustomerActionResult =
  | { ok: true; customer: Customer }
  | { ok: false; error: CustomerError };

/**
 * What a form gets back. The message is already shopper-safe: BigCommerce's
 * own wording is kept where it is specific and useful (a `ValidationError`
 * naming the bad field) and replaced where it describes its internals.
 *
 * `ok` rather than a server-side `redirect()` because signing in changes which
 * cart the server will hand back, and the cart lives in client state seeded
 * once on mount. A client-side transition would leave the old cart on screen
 * under the new session, so the form navigates with a full load instead.
 */
export type AuthFormState = {
  ok: boolean;
  message: string | null;
} | null;
