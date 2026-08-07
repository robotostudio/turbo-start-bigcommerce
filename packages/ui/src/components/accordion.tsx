import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { cn } from "@workspace/ui/lib/utils";
import { ChevronDownIcon } from "lucide-react";
import type * as React from "react";

function Accordion({
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      className={cn("border-b last:border-b-0", className)}
      data-slot="accordion-item"
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  indicator = "chevron",
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger> & {
  indicator?: "chevron" | "plus-minus";
}) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        className={cn(
          "group flex flex-1 justify-between gap-4 rounded-md py-4 text-left font-medium text-sm outline-none transition-colors duration-150 ease-hover focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
          indicator === "chevron"
            ? "items-start hover:underline [&[data-state=open]>svg]:rotate-180"
            : "items-center",
          className
        )}
        data-slot="accordion-trigger"
        {...props}
      >
        {children}
        {indicator === "chevron" ? (
          <ChevronDownIcon className="pointer-events-none size-4 shrink-0 translate-y-0.5 text-muted-foreground transition-transform duration-200" />
        ) : (
          /* Plus morphs into a minus by rotating the vertical bar flat, rather
           * than swapping two icons with hidden/block. Transform-only, and
           * because it's a transition on a persistent node it interpolates from
           * the current angle when the trigger is mashed instead of snapping. */
          <span className="pointer-events-none relative flex size-4 shrink-0 items-center justify-center text-muted-foreground">
            <span className="absolute h-px w-3 bg-current" />
            {/* motion-reduce drops the transition, not the rotation: the bar
             * still flips flat so the plus/minus state stays legible, it just
             * gets there instantly instead of sweeping. */}
            <span className="absolute h-px w-3 rotate-90 bg-current transition-transform duration-200 ease-flow group-data-[state=open]:rotate-0 motion-reduce:transition-none" />
          </span>
        )}
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      /* Stays on keyframes rather than a transition: Radix's Presence detects
       * exits via `animationName`, so a transition would give no close
       * animation at all. `ease-flow` because expanding a panel is on-screen
       * movement of an already-visible container, not an entrance. */
      className="overflow-hidden text-sm duration-200 ease-flow data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
      data-slot="accordion-content"
      {...props}
    >
      <div className={cn("pt-0 pb-4", className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
