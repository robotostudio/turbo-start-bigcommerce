"use client";

import { Button } from "@workspace/ui/components/button";
import { useTransition } from "react";

import { signOutAction } from "@/app/account/actions";

/**
 * Signing out hands the cart back from the customer to the anonymous session,
 * which can change the cart id, so this reloads rather than routing — the same
 * reason the sign-in forms do.
 */
export function SignOutButton() {
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      await signOutAction();
      window.location.assign("/");
    });
  };

  return (
    <Button disabled={pending} onClick={handleClick} variant="outline">
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
