"use client";

import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { LoaderCircle } from "lucide-react";
import { useActionState, useEffect, useId } from "react";
import { useFormStatus } from "react-dom";

import { registerAction, signInAction } from "@/app/account/actions";
import type { AuthFormState } from "@/lib/customer/types";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button className="w-full" disabled={pending} type="submit">
      {pending ? (
        <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
      ) : (
        label
      )}
    </Button>
  );
}

/**
 * A full load rather than a router push. Signing in can hand the shopper a
 * different cart, and the cart is client state seeded once when the provider
 * mounts — a client-side transition would keep the old one on screen under the
 * new session.
 */
function useNavigateOnSuccess(state: AuthFormState, to: string) {
  useEffect(() => {
    if (state?.ok) window.location.assign(to);
  }, [state, to]);
}

/** Announced rather than just coloured, so it reaches a screen reader too. */
function FormError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p className="text-destructive text-sm" role="alert">
      {message}
    </p>
  );
}

export function SignInForm() {
  const [state, action] = useActionState(signInAction, null);
  const emailId = useId();
  const passwordId = useId();
  useNavigateOnSuccess(state, "/account");

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-2">
        <label className="font-medium text-sm" htmlFor={emailId}>
          Email
        </label>
        <Input
          autoComplete="email"
          id={emailId}
          name="email"
          required
          type="email"
        />
      </div>
      <div className="grid gap-2">
        <label className="font-medium text-sm" htmlFor={passwordId}>
          Password
        </label>
        <Input
          autoComplete="current-password"
          id={passwordId}
          name="password"
          required
          type="password"
        />
      </div>
      <FormError message={state?.message} />
      <SubmitButton label="Sign in" />
    </form>
  );
}

export function RegisterForm() {
  const [state, action] = useActionState(registerAction, null);
  const firstNameId = useId();
  const lastNameId = useId();
  const emailId = useId();
  const passwordId = useId();
  useNavigateOnSuccess(state, "/account");

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <label className="font-medium text-sm" htmlFor={firstNameId}>
            First name
          </label>
          <Input
            autoComplete="given-name"
            id={firstNameId}
            name="firstName"
            required
          />
        </div>
        <div className="grid gap-2">
          <label className="font-medium text-sm" htmlFor={lastNameId}>
            Last name
          </label>
          <Input
            autoComplete="family-name"
            id={lastNameId}
            name="lastName"
            required
          />
        </div>
      </div>
      <div className="grid gap-2">
        <label className="font-medium text-sm" htmlFor={emailId}>
          Email
        </label>
        <Input
          autoComplete="email"
          id={emailId}
          name="email"
          required
          type="email"
        />
      </div>
      <div className="grid gap-2">
        <label className="font-medium text-sm" htmlFor={passwordId}>
          Password
        </label>
        <Input
          autoComplete="new-password"
          id={passwordId}
          name="password"
          required
          type="password"
        />
      </div>
      <FormError message={state?.message} />
      <SubmitButton label="Create account" />
    </form>
  );
}
