"use client";

import Link from "next/link";

export function NewsletterForm() {
  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => e.preventDefault()}
      >
        <div className="flex w-full max-w-md flex-col gap-2">
          <label className="text-foreground text-sm" htmlFor="newsletter-email">
            Sign up to our newsletter
          </label>
          <input
            className="w-full border-border border-b bg-transparent pb-1 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none"
            id="newsletter-email"
            name="email"
            placeholder="Email address"
            required
            type="email"
          />
        </div>
        <button
          className="cursor-pointer bg-foreground px-3 py-1.5 text-background text-sm transition-opacity hover:opacity-90"
          type="submit"
        >
          Submit
        </button>
      </form>
      <p className="max-w-84 text-muted-foreground text-xs">
        By submitting, you agree to the{" "}
        <Link className="underline" href="/terms">
          Terms &amp; Conditions
        </Link>{" "}
        and{" "}
        <Link className="underline" href="/privacy">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
