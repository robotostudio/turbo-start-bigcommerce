import type { ComponentProps, Dispatch, SetStateAction } from "react";

/**
 * Both desktop dropdowns opened on `onMouseEnter` alone, so the primary
 * navigation was unreachable without a mouse.
 */
export function dropdownHandlers(
  isOpen: boolean,
  setIsOpen: Dispatch<SetStateAction<boolean>>
): ComponentProps<"div"> {
  return {
    // Guarded on `pointerType`: a tap fires `mouseenter` before `click`, so
    // hover opened the panel and the trigger's toggle closed it in the same
    // gesture — no dropdown could be opened by touch. `lg:flex`, so a large
    // tablet gets this nav rather than the mobile sheet.
    onPointerEnter: (event) => {
      if (event.pointerType === "mouse") setIsOpen(true);
    },
    onPointerLeave: (event) => {
      if (event.pointerType === "mouse") setIsOpen(false);
    },
    // Capture phase: focus events do not bubble, so plain `onFocus` on the
    // wrapper would never fire for the trigger or the panel's links.
    onFocusCapture: () => setIsOpen(true),
    onBlurCapture: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        setIsOpen(false);
      }
    },
    onKeyDown: (event) => {
      if (event.key !== "Escape" || !isOpen) return;
      setIsOpen(false);
      // Focus sits inside the panel about to be hidden; without this it falls
      // to the document body.
      event.currentTarget.querySelector("button")?.focus();
    },
  };
}
