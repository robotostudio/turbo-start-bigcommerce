import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/account/sign-out-button";
import { getCustomer } from "@/lib/customer/auth";
import { getSEOMetadata } from "@/lib/seo";

export const metadata: Metadata = getSEOMetadata({
  title: "Your account",
  description: "Your account details.",
  robots: "noindex, nofollow",
});

export default async function AccountPage() {
  const customer = await getCustomer();
  if (!customer) redirect("/login");

  return (
    <main className="site-container py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-1 font-semibold text-2xl">
          Hello, {customer.firstName}
        </h1>
        <p className="mb-8 text-muted-foreground text-sm">{customer.email}</p>
        <SignOutButton />
      </div>
    </main>
  );
}
