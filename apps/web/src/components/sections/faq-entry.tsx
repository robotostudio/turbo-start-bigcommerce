"use client";

import { cn } from "@workspace/ui/lib/utils";
import { Minus, Plus } from "lucide-react";
import { motion, type Variants } from "motion/react";
import { type MouseEvent, useEffect, useState } from "react";

import type { SanityRichTextProps } from "@/types";
import { RichText } from "../elements/rich-text";

// `flat` — the hairline-divider rows used by the FAQ categories block. `card` — the
// rounded, filled cards used by the FAQ accordion block.
type FaqVariant = "flat" | "card";

// Progressively-enhanced FAQ row. The native <details> + answer are always in the
// DOM, so with JS disabled it toggles instantly (and the answer ships in the server
// HTML for SEO). Once hydrated, JS intercepts the toggle and motion height-animates
// the panel smoothly both ways — `rendered` keeps the element in the [open] state
// until the close animation finishes so the panel stays visible while collapsing.
export function FaqEntry({
  title,
  richText,
  defaultOpen = false,
  variant = "flat",
  motionVariants,
}: {
  title?: string | null;
  richText?: SanityRichTextProps | null;
  defaultOpen?: boolean;
  variant?: FaqVariant;
  motionVariants?: Variants;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [rendered, setRendered] = useState(defaultOpen);

  useEffect(() => {
    if (open) setRendered(true);
  }, [open]);

  const toggle = (event: MouseEvent) => {
    event.preventDefault(); // hand the toggle to JS/motion; native fallback still works with JS off
    setOpen((prev) => !prev);
  };

  const card = variant === "card";

  return (
    <motion.div
      className={cn(
        "group",
        card
          ? "rounded-sm bg-zinc-100 dark:bg-zinc-900"
          : "border-zinc-200 border-b first:border-t dark:border-zinc-800"
      )}
      variants={motionVariants}
    >
      <details open={rendered}>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: <summary> is natively interactive + keyboard-operable */}
        <summary
          className={cn(
            "flex cursor-pointer list-none items-center justify-between gap-4 text-sm marker:hidden [&::-webkit-details-marker]:hidden",
            card ? "px-5 py-4" : "py-3 text-zinc-900 dark:text-zinc-100"
          )}
          onClick={toggle}
        >
          <span className={cn(card && "flex-1 text-left")}>{title}</span>
          <span
            className={cn(
              "shrink-0",
              card ? "text-foreground" : "text-zinc-500"
            )}
          >
            <Plus className={cn("size-4", open && "hidden")} />
            <Minus className={cn("size-4", !open && "hidden")} />
          </span>
        </summary>
        <motion.div
          animate={{ height: open ? "auto" : 0 }}
          className="overflow-hidden"
          initial={false}
          onAnimationComplete={() => {
            if (!open) setRendered(false);
          }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <RichText
            className={cn(
              card
                ? "px-5 pb-4 text-sm text-muted-foreground md:text-base"
                : "pb-6 text-sm text-zinc-950 dark:text-zinc-50"
            )}
            richText={richText ?? []}
          />
        </motion.div>
      </details>
    </motion.div>
  );
}
