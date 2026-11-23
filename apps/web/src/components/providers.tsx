"use client";

import {
  environmentManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { PropsWithChildren } from "react";

import type { Cart } from "@/lib/cart/types";
import { CartProvider } from "./cart/cart-context";
import { SavedItemsProvider } from "./saved-items/saved-items-context";

// Server queries never expire, so a shared client served the first request's
// data to every later one: one client per server request, one per browser.
// No default `staleTime`: seeds from ISR pages must revalidate on mount.
let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (environmentManager.isServer()) {
    return new QueryClient();
  }
  browserQueryClient ??= new QueryClient();
  return browserQueryClient;
}

export function Providers({
  children,
  initialCart,
}: PropsWithChildren<{ initialCart?: Cart | null }>) {
  const queryClient = getQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <CartProvider initialCart={initialCart}>
        <SavedItemsProvider>
          <NextThemesProvider
            attribute="class"
            defaultTheme="system"
            disableTransitionOnChange
            enableColorScheme
            enableSystem
          >
            {children}
          </NextThemesProvider>
        </SavedItemsProvider>
      </CartProvider>
    </QueryClientProvider>
  );
}
