"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import {
  addToCart,
  getCart,
  removeCartLine,
  updateCartLine,
} from "@/app/cart/actions";
import { type AddLineResult, CartController } from "@/lib/cart/controller";
import type { CartError, CartWarning, LineMetadata } from "@/lib/cart/types";
import type { Cart } from "@/lib/shopify/types";

type CartStateValue = {
  cart: Cart | null;
  confirmedCart: Cart | null;
  isLoading: boolean;
  isMutating: boolean;
  isCreatingCart: boolean;
  hasPendingAdds: boolean;
  isCartOpen: boolean;
  cartError: CartError | null;
  warnings: CartWarning[];
};

type CartActionsValue = {
  openCart: () => void;
  closeCart: () => void;
  clearCartError: () => void;
  clearWarnings: () => void;
  addLine: (
    variantId: string,
    quantity: number,
    metadata: LineMetadata
  ) => Promise<AddLineResult>;
  updateLine: (lineId: string, quantity: number) => void;
  swapLineVariant: (
    lineId: string,
    merchandiseId: string,
    quantity: number,
    metadata?: Partial<LineMetadata>
  ) => void;
  removeLine: (lineId: string) => void;
  settle: () => Promise<Cart | null>;
};

type CartContextValue = CartStateValue & CartActionsValue;

const CartStateContext = createContext<CartStateValue | null>(null);
const CartActionsContext = createContext<CartActionsValue | null>(null);

export function CartProvider({
  children,
  initialCart,
}: {
  children: React.ReactNode;
  initialCart?: Cart | null;
}) {
  const [controller] = useState(() => {
    const instance = new CartController({
      getCart,
      addLines: addToCart,
      updateLine: updateCartLine,
      removeLine: removeCartLine,
    });
    if (initialCart !== undefined) {
      instance.seed(initialCart);
    }
    return instance;
  });

  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );

  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(initialCart === undefined);

  useEffect(() => {
    if (initialCart !== undefined) return;
    let cancelled = false;
    getCart()
      .then((cart) => {
        controller.seed(cart);
      })
      .catch(() => {
        controller.seed(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [controller, initialCart]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        controller.refetch();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [controller]);

  useEffect(() => {
    return () => {
      controller.dispose();
    };
  }, [controller]);

  const actions = useMemo<CartActionsValue>(
    () => ({
      openCart: () => setIsCartOpen(true),
      closeCart: () => setIsCartOpen(false),
      clearCartError: () => controller.clearError(),
      clearWarnings: () => controller.clearWarnings(),
      addLine: (variantId, quantity, metadata) =>
        controller.addLine(variantId, quantity, metadata),
      updateLine: (lineId, quantity) => controller.updateLine(lineId, quantity),
      swapLineVariant: (lineId, merchandiseId, quantity, metadata) =>
        controller.swapLineVariant(lineId, merchandiseId, quantity, metadata),
      removeLine: (lineId) => controller.removeLine(lineId),
      settle: () => controller.settle(),
    }),
    [controller]
  );

  const state = useMemo<CartStateValue>(
    () => ({
      cart: snapshot.cartWithPending,
      confirmedCart: snapshot.cart,
      isLoading,
      isMutating: snapshot.isMutating,
      isCreatingCart: snapshot.isCreatingCart,
      hasPendingAdds: snapshot.hasPendingAdds,
      isCartOpen,
      cartError: snapshot.error,
      warnings: snapshot.warnings,
    }),
    [snapshot, isLoading, isCartOpen]
  );

  return (
    <CartActionsContext value={actions}>
      <CartStateContext value={state}>{children}</CartStateContext>
    </CartActionsContext>
  );
}

export function useCartState(): CartStateValue {
  const context = useContext(CartStateContext);
  if (!context) {
    throw new Error("useCartState must be used within a CartProvider");
  }
  return context;
}

/**
 * Stable action handles only — consumers never re-render on cart changes.
 * Prefer this in add-to-cart buttons and other write-only surfaces.
 */
export function useCartActions(): CartActionsValue {
  const context = useContext(CartActionsContext);
  if (!context) {
    throw new Error("useCartActions must be used within a CartProvider");
  }
  return context;
}

export function useCart(): CartContextValue {
  const state = useCartState();
  const actions = useCartActions();
  return useMemo(() => ({ ...state, ...actions }), [state, actions]);
}
