import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { RegisterForm, SignInForm } from "@/components/account/auth-forms";
import { getCustomer } from "@/lib/customer/auth";
import { getSEOMetadata } from "@/lib/seo";

export const metadata: Metadata = getSEOMetadata({
  title: "Sign in",
  description: "Sign in to your account or create a new one.",
  // Nothing here is worth indexing, and a login page in search results is a
  // phishing lookalike waiting to happen.
  robots: "noindex, nofollow",
});

export default async function LoginPage() {
  if (await getCustomer()) redirect("/account");

  return (
    <main className="site-container py-16">
      <div className="mx-auto grid max-w-4xl gap-12 md:grid-cols-2">
        <section>
          <h1 className="mb-1 font-semibold text-2xl">Sign in</h1>
          <p className="mb-6 text-muted-foreground text-sm">
            Your basket comes with you.
          </p>
          <SignInForm />
        </section>
        <section>
          <h2 className="mb-1 font-semibold text-2xl">Create an account</h2>
          <p className="mb-6 text-muted-foreground text-sm">
            Checkout is quicker next time.
          </p>
          <RegisterForm />
        </section>
      </div>
    </main>
  );
}
