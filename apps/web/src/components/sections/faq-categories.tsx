"use client";

import { cn } from "@workspace/ui/lib/utils";
import { motion } from "motion/react";
import { useState } from "react";

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

export function FaqCategories({ title, categories }: FaqCategoriesProps) {
  const groups = categories ?? [];
  const allFaqs = groups.flatMap((category) => category?.faqs ?? []);
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <section className="py-12 md:py-20" id="faq">
      <FaqJsonLd faqs={allFaqs} />
      <div className="site-container">
        <h2 className="mb-8 font-medium text-2xl md:mb-12 md:text-3xl">
          {title}
        </h2>

        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-16">
          {/* Left rail — clickable category tabs */}
          <div
            aria-label="FAQ categories"
            aria-orientation="vertical"
            className="flex flex-col gap-2 self-start md:sticky md:top-24"
            role="tablist"
          >
            {groups.map((category, index) => (
              <button
                aria-controls={`faq-panel-${category?._key}`}
                aria-selected={index === activeIndex}
                className={cn(
                  "text-left text-sm tracking-wide transition-colors",
                  index === activeIndex
                    ? "font-medium text-zinc-900 dark:text-zinc-100"
                    : "text-muted-foreground hover:text-zinc-900 dark:hover:text-zinc-100"
                )}
                id={`faq-tab-${category?._key}`}
                key={category?._key}
                onClick={() => setActiveIndex(index)}
                role="tab"
                type="button"
              >
                {category?.title}
              </button>
            ))}
          </div>

          {/* Right column — every category stays in the DOM (SEO); only the
              active one is visible, and its items stagger in on switch */}
          <div>
            {groups.map((category, index) => {
              const isActive = index === activeIndex;
              return (
                <motion.div
                  animate={isActive ? "show" : "hidden"}
                  aria-labelledby={`faq-tab-${category?._key}`}
                  hidden={!isActive}
                  id={`faq-panel-${category?._key}`}
                  initial="hidden"
                  key={category?._key}
                  role="tabpanel"
                  variants={listVariants}
                >
                  <motion.p
                    className="mb-6 text-sm text-zinc-800 dark:text-zinc-200"
                    variants={itemVariants}
                  >
                    {category?.title}
                  </motion.p>

                  <div className="flex flex-col">
                    {(category?.faqs ?? []).map((faq, faqIndex) => (
                      <FaqEntry
                        defaultOpen={faqIndex === 0}
                        key={faq?._id}
                        motionVariants={itemVariants}
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
      </div>
    </section>
  );
}
