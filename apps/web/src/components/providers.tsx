"use client";

import {
  isServer,
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
// 60s `staleTime` keeps a server-seeded query from refetching on hydration.
const QUERY_CLIENT_OPTIONS = {
  defaultOptions: { queries: { staleTime: 60 * 1000 } },
};

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (isServer) {
    return new QueryClient(QUERY_CLIENT_OPTIONS);
  }
  browserQueryClient ??= new QueryClient(QUERY_CLIENT_OPTIONS);
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
