"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";

import type { PagebuilderType } from "@/types";
import { FaqJsonLd } from "../json-ld";
import { FaqEntry } from "./faq-entry";

type FaqCategoriesProps = PagebuilderType<"faqCategories">;

const listVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: "easeOut" as const },
  },
};

// The category switcher is a real radio group rather than an ARIA tablist. A
// tablist is only honest when JS is there to move focus and flip aria-selected;
// with JS off this has to work anyway, and a radio group gets us the whole
// contract for free — arrow keys move between categories, the group is a single
// tab stop, and screen readers announce "2 of 5" without us asserting anything
// the markup cannot back up.
//
// Panel visibility is therefore CSS, not React: `:checked ~ * [data-faq-panel]`
// reveals the matching panel. It has to be generated at runtime because the
// selectors are keyed on this block's `_key`, which Tailwind cannot see when it
// scans the source, and the `hidden` attribute is off the table because nothing
// would remove it without JS.
function switcherStyles(scope: string, count: number) {
  const rules: string[] = [];
  for (let index = 0; index < count; index++) {
    const input = `#${scope}-input-${index}`;
    rules.push(
      `${input}:checked ~ * [data-faq-panel="${index}"]{display:block}`,
      `${input}:checked ~ * [data-faq-tab="${index}"]` +
        "{color:var(--faq-tab-active);font-weight:500}",
      `${input}:focus-visible ~ * [data-faq-tab="${index}"]` +
        "{outline:2px solid var(--color-ring);outline-offset:3px}"
    );
  }
  return rules.join("");
}

export function FaqCategories({ _key, title, categories }: FaqCategoriesProps) {
  const groups = categories ?? [];
  const allFaqs = groups.flatMap((category) => category?.faqs ?? []);
  // Studio mints alphanumeric `_key`s, but a programmatic import can put any
  // string there — and this one is interpolated into selectors, ids and the
  // radio `name`, so it has to stay CSS-safe. Escaped rather than stripped,
  // because stripping is not injective (`a#b` and `ab` would share a scope):
  // an unsafe character becomes `_<hex>_` and a literal underscore doubles,
  // so distinct keys always produce distinct scopes.
  const scope = `faq-${_key.replace(/[^a-zA-Z0-9-]/g, (char) =>
    char === "_" ? "__" : `_${char.codePointAt(0)?.toString(16)}_`
  )}`;

  // `hydrated` gates every motion prop. Motion serialises a variant's initial
  // styles into the server HTML, so leaving the variants on during SSR would
  // ship `opacity: 0` to a visitor with JS off — the exact failure this block is
  // meant to avoid. Post-hydration the stagger comes back and `activeIndex` is
  // seeded from whichever radio the DOM actually has checked, since the visitor
  // may well have switched category before the bundle landed.
  const [activeIndex, setActiveIndex] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const checked = document.querySelector<HTMLInputElement>(
      `input[name="${scope}"]:checked`
    );
    if (checked) setActiveIndex(Number(checked.value));
    setHydrated(true);
  }, [scope]);

  return (
    <section className="py-12 md:py-20" id="faq">
      <FaqJsonLd faqs={allFaqs} />
      <div className="site-container">
        <h2 className="mb-8 font-medium text-2xl md:mb-12 md:text-3xl">
          {title}
        </h2>

        {/* A fieldset so the radio group carries a programmatic name; the
            legend is first, so the inputs are still preceding siblings of the
            grid and the `~` selectors above keep working. */}
        <fieldset className="min-w-0 [--faq-tab-active:var(--color-zinc-900)] dark:[--faq-tab-active:var(--color-zinc-100)]">
          <legend className="sr-only">{title ?? "FAQ categories"}</legend>
          <style>{switcherStyles(scope, groups.length)}</style>

          {/* Kept out of the grid so the `~` combinator can reach both columns.
              sr-only clips them rather than hiding them, which keeps them
              focusable and keyboard-operable. */}
          {groups.map((category, index) => (
            <input
              className="sr-only"
              defaultChecked={index === 0}
              id={`${scope}-input-${index}`}
              key={category?._key ? `key-${category._key}` : `index-${index}`}
              name={scope}
              onChange={() => setActiveIndex(index)}
              type="radio"
              value={index}
            />
          ))}

          <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-16">
            {/* Left rail — category labels, styled active by the CSS above */}
            <div className="flex flex-col gap-2 self-start md:sticky md:top-24">
              {groups.map((category, index) => (
                <label
                  className="cursor-pointer text-left text-muted-foreground text-sm tracking-wide transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
                  data-faq-tab={index}
                  htmlFor={`${scope}-input-${index}`}
                  id={`${scope}-label-${index}`}
                  key={
                    category?._key ? `key-${category._key}` : `index-${index}`
                  }
                >
                  {category?.title}
                </label>
              ))}
            </div>

            {/* Right column — every category stays in the DOM (SEO); only the
                checked one is displayed, and once hydrated its items stagger in
                on switch */}
            <div>
              {groups.map((category, index) => {
                const state = index === activeIndex ? "show" : "hidden";
                return (
                  <motion.div
                    animate={hydrated ? state : undefined}
                    aria-labelledby={`${scope}-label-${index}`}
                    className="hidden"
                    data-faq-panel={index}
                    initial={false}
                    key={
                      category?._key ? `key-${category._key}` : `index-${index}`
                    }
                    role="group"
                    variants={hydrated ? listVariants : undefined}
                  >
                    <motion.p
                      className="mb-6 text-sm text-zinc-800 dark:text-zinc-200"
                      variants={hydrated ? itemVariants : undefined}
                    >
                      {category?.title}
                    </motion.p>

                    <div className="flex flex-col">
                      {(category?.faqs ?? []).map((faq, faqIndex) => (
                        <FaqEntry
                          defaultOpen={faqIndex === 0}
                          key={faq?._id}
                          motionVariants={hydrated ? itemVariants : undefined}
                          richText={faq?.richText}
                          title={faq?.title}
                        />
                      ))}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </fieldset>
      </div>
    </section>
  );
}
