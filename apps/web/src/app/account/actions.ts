"use server";

import { z } from "zod";

import { login, logout, register } from "@/lib/customer/auth";
import type { AuthFormState } from "@/lib/customer/types";

/**
 * Server actions, so Next's own Origin check covers the CSRF case. A login
 * form posting to a route handler would need that check written by hand.
 */

const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

/**
 * Deliberately thin. BigCommerce owns the password policy — length, character
 * classes, reuse — and it is configurable per store, so duplicating any of it
 * here would give a shopper one rule on the client and a different one from
 * the API. A blank field is worth catching locally; everything else is
 * BigCommerce's `ValidationError`, whose message names the field it rejected
 * and is shown as-is.
 */
const registerSchema = z.object({
  firstName: z.string().trim().min(1, "Please enter your first name."),
  lastName: z.string().trim().min(1, "Please enter your last name."),
  email: z.email("Please enter a valid email address."),
  password: z.string().min(1, "Please enter a password."),
});

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Please check the details you entered.";
}

export async function signInAction(
  _previous: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    // Same wording as a rejected password on purpose: a malformed email that
    // says "invalid email" and an unknown one that says "no such account"
    // between them turn this form into an account-existence oracle.
    return { ok: false, message: "Your email or password is not correct." };
  }

  const result = await login(parsed.data);

  return result.ok
    ? { ok: true, message: null }
    : { ok: false, message: result.error.message };
}

/**
 * Creates the account, then signs in.
 *
 * The second call is not a convenience. `registerCustomer` issues no access
 * token and takes no cart id, so registration alone leaves the shopper
 * anonymous with their basket still unattached — `login` is where both the
 * session and the cart merge actually happen.
 */
export async function registerAction(
  _previous: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error) };
  }

  const created = await register(parsed.data);
  if (!created.ok) {
    return { ok: false, message: created.error.message };
  }

  const session = await login({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (!session.ok) {
    // The account exists at this point, so sending them to sign in by hand is
    // recoverable. Saying the account was not created would be a lie that
    // makes them try again and hit "email already in use".
    return {
      ok: false,
      message: "Your account was created. Please sign in.",
    };
  }

  return { ok: true, message: null };
}

export async function signOutAction(): Promise<void> {
  await logout();
}
