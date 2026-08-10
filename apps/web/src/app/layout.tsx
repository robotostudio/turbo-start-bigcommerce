import "@workspace/ui/globals.css";

import { SanityLive } from "@workspace/sanity/live";
import { Toaster } from "@workspace/ui/components/sonner";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { draftMode } from "next/headers";
import { VisualEditing } from "next-sanity/visual-editing";
import { Suspense } from "react";
import { preconnect, prefetchDNS } from "react-dom";

import { CartToasts } from "@/components/cart/cart-toasts";
import { FooterServer, FooterSkeleton } from "@/components/footer";
import { CombinedJsonLd } from "@/components/combined-json-ld";
import { Navbar } from "@/components/navbar";
import { PreviewBar } from "@/components/preview-bar";
import { PromoBanner } from "@/components/promo-banner";
import { Providers } from "@/components/providers";
import { getNavigationData } from "@/lib/navigation";

const fontSans = GeistSans;
const fontMono = GeistMono;

export default async function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
}>) {
  preconnect("https://cdn.sanity.io");
  prefetchDNS("https://cdn.sanity.io");
  const nav = await getNavigationData();
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${fontSans.variable} ${fontMono.variable} font-sans antialiased`}
      >
        <Providers>
          {/* First focusable element on every page, deliberately. Without it a
           * keyboard user tabs the promo banner and the whole nav before
           * reaching a product — on a listing page that is 149 stops. Hidden
           * with `sr-only` rather than `display: none`, which would take it
           * back out of the tab order and defeat the point. */}
          <a
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:font-medium focus:text-foreground focus:shadow-lg focus:outline-2 focus:outline-ring focus:outline-offset-2"
            href="#main-content"
          >
            Skip to content
          </a>
          <div className="flex min-h-screen flex-col">
            <PromoBanner data={nav.promoBannerData} />
            <Navbar
              navbarData={nav.navbarData}
              settingsData={nav.settingsData}
            />
            {/* `tabIndex={-1}` so the skip link actually moves focus here, not
             * just the scroll position. Kept a div rather than promoted to
             * `main`: several pages render their own `main` inside, and
             * nesting them would be worse than the inconsistency. */}
            <div className="flex-1" id="main-content" tabIndex={-1}>
              {children}
            </div>
            <Suspense fallback={<FooterSkeleton />}>
              <FooterServer />
            </Suspense>
          </div>
          {modal}
          <CartToasts />
          <Toaster position="bottom-right" richColors />
          <SanityLive />
          <CombinedJsonLd includeOrganization includeWebsite />
          {(await draftMode()).isEnabled && (
            <>
              <PreviewBar />
              <VisualEditing />
            </>
          )}
        </Providers>
      </body>
    </html>
  );
}
