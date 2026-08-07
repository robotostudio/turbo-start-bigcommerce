"use client";
import { cn } from "@workspace/ui/lib/utils";
import Link from "next/link";
import { type FC, useEffect, useMemo, useState } from "react";
import slugify from "slugify";

import type { SanityRichTextBlock, SanityRichTextProps } from "@/types";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

type TableOfContentProps = {
  richText?: SanityRichTextProps;
  className?: string;
  maxDepth?: number;
};

type ProcessedHeading = {
  readonly id: string;
  readonly text: string;
  readonly href: string;
  readonly level: number;
  readonly style: HeadingStyle;
  readonly children: ProcessedHeading[];
  readonly isChild: boolean;
  readonly _key?: string;
};

type AnchorProps = {
  readonly heading: ProcessedHeading;
  readonly maxDepth?: number;
  readonly currentDepth?: number;
  readonly activeSlug: string | null;
  readonly onSelect: (slug: string) => void;
};

type TableOfContentState = {
  readonly shouldShow: boolean;
  readonly headings: ProcessedHeading[];
  readonly error?: string;
};

type HeadingStyle = "h2" | "h3" | "h4" | "h5" | "h6";

type SanityTextChild = {
  readonly marks?: readonly string[];
  readonly text?: string;
  readonly _type: "span";
  readonly _key: string;
};

type HeadingBlock = Extract<SanityRichTextBlock, { _type: "block" }> & {
  style: HeadingStyle;
  children: readonly SanityTextChild[];
};

// ============================================================================
// CONSTANTS
// ============================================================================

const HEADING_STYLES: Record<HeadingStyle, string> = {
  h2: "pl-0",
  h3: "pl-4",
  h4: "pl-8",
  h5: "pl-12",
  h6: "pl-16",
} as const;

const HEADING_LEVELS: Record<HeadingStyle, number> = {
  h2: 2,
  h3: 3,
  h4: 4,
  h5: 5,
  h6: 6,
} as const;

const SLUGIFY_OPTIONS = {
  lower: true,
  strict: true,
  remove: /[*+~.()'"!:@]/g,
} as const;

const DEFAULT_MAX_DEPTH = 6;
const MIN_HEADINGS_TO_SHOW = 1;

// ============================================================================
// TYPE GUARDS & VALIDATORS
// ============================================================================

function isValidHeadingStyle(style: unknown): style is HeadingStyle {
  return typeof style === "string" && style in HEADING_STYLES;
}

function isValidTextChild(child: unknown): child is SanityTextChild {
  return (
    typeof child === "object" &&
    child !== null &&
    "_type" in child &&
    child._type === "span" &&
    "text" in child &&
    typeof child.text === "string"
  );
}

function hasValidTextChildren(
  children: unknown
): children is readonly SanityTextChild[] {
  return (
    Array.isArray(children) &&
    children.length > 0 &&
    children.every(isValidTextChild)
  );
}

function isHeadingBlock(block: unknown): block is HeadingBlock {
  if (
    typeof block !== "object" ||
    block === null ||
    !("_type" in block) ||
    block._type !== "block"
  ) {
    return false;
  }

  const candidate = block as Record<string, unknown>;

  return (
    isValidHeadingStyle(candidate.style) &&
    hasValidTextChildren(candidate.children)
  );
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function createSlug(text: string): string {
  if (!text?.trim()) {
    return "";
  }

  try {
    return slugify(text.trim(), SLUGIFY_OPTIONS);
  } catch (_error) {
    return text
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]/g, "");
  }
}

function extractTextFromChildren(children: readonly SanityTextChild[]): string {
  try {
    return children
      .map((child) => child.text?.trim() ?? "")
      .filter(Boolean)
      .join(" ")
      .trim();
  } catch (_error) {
    return "";
  }
}

function generateUniqueId(text: string, index: number, _key?: string): string {
  const baseId = _key || createSlug(text) || `heading-${index}`;
  return `toc-${baseId}`;
}

// ============================================================================
// CORE BUSINESS LOGIC
// ============================================================================

function extractHeadingBlocks(richText: SanityRichTextProps): HeadingBlock[] {
  if (!(richText && Array.isArray(richText))) {
    return [];
  }

  try {
    return richText.filter(isHeadingBlock);
  } catch (_error) {
    return [];
  }
}

function createProcessedHeading(
  block: HeadingBlock,
  index: number
): ProcessedHeading | null {
  try {
    const text = extractTextFromChildren(block.children);

    if (!text) {
      return null;
    }

    const level = HEADING_LEVELS[block.style];
    const href = `#${createSlug(text)}`;
    const id = generateUniqueId(text, index, block._key);

    return {
      id,
      text,
      href,
      level,
      style: block.style,
      children: [],
      isChild: false,
      _key: block._key,
    };
  } catch (_error) {
    return null;
  }
}

function buildHeadingHierarchy(
  flatHeadings: ProcessedHeading[],
  maxDepth: number = DEFAULT_MAX_DEPTH
): ProcessedHeading[] {
  if (flatHeadings.length === 0) {
    return [];
  }

  try {
    const result: ProcessedHeading[] = [];
    const processed = new Set<number>();

    flatHeadings.forEach((heading, index) => {
      if (processed.has(index) || heading.level > maxDepth) {
        return;
      }

      const children = collectChildHeadings(
        flatHeadings,
        index,
        processed,
        maxDepth
      );

      result.push({
        ...heading,
        children,
      });
    });

    return result;
  } catch (_error) {
    return flatHeadings.map((heading) => ({
      ...heading,
      children: [],
    }));
  }
}

function collectChildHeadings(
  headings: ProcessedHeading[],
  parentIndex: number,
  processed: Set<number>,
  maxDepth: number
): ProcessedHeading[] {
  const parentHeading = headings[parentIndex];

  if (!parentHeading || parentHeading.level >= maxDepth) {
    return [];
  }

  const children: ProcessedHeading[] = [];
  const parentLevel = parentHeading.level;

  for (let i = parentIndex + 1; i < headings.length; i++) {
    const currentHeading = headings[i];

    if (!currentHeading || currentHeading.level <= parentLevel) {
      break;
    }

    if (processed.has(i) || currentHeading.level > maxDepth) {
      continue;
    }

    processed.add(i);

    const nestedChildren = collectChildHeadings(
      headings,
      i,
      processed,
      maxDepth
    );

    children.push({
      ...currentHeading,
      children: nestedChildren,
      isChild: true,
    });
  }

  return children;
}

function processHeadingBlocks(
  headingBlocks: HeadingBlock[],
  maxDepth: number = DEFAULT_MAX_DEPTH
): ProcessedHeading[] {
  if (!Array.isArray(headingBlocks) || headingBlocks.length === 0) {
    return [];
  }

  try {
    const processedHeadings = headingBlocks
      .map(createProcessedHeading)
      .filter((heading): heading is ProcessedHeading => heading !== null);

    return buildHeadingHierarchy(processedHeadings, maxDepth);
  } catch (_error) {
    return [];
  }
}

// ============================================================================
// CUSTOM HOOKS
// ============================================================================

function useTableOfContentState(
  richText?: SanityRichTextProps,
  maxDepth: number = DEFAULT_MAX_DEPTH
): TableOfContentState {
  return useMemo(() => {
    try {
      if (!(richText && Array.isArray(richText)) || richText.length === 0) {
        return {
          shouldShow: false,
          headings: [],
        };
      }

      const headingBlocks = extractHeadingBlocks(richText);

      if (headingBlocks.length < MIN_HEADINGS_TO_SHOW) {
        return {
          shouldShow: false,
          headings: [],
        };
      }

      const processedHeadings = processHeadingBlocks(headingBlocks, maxDepth);

      return {
        shouldShow: processedHeadings.length >= MIN_HEADINGS_TO_SHOW,
        headings: processedHeadings,
      };
    } catch (error) {
      return {
        shouldShow: false,
        headings: [],
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }, [richText, maxDepth]);
}

// ============================================================================
// SCROLL SPY
// ============================================================================

/** Vertical offset (px) so anchored headings clear the sticky navbar. */
const SCROLL_OFFSET = 96;

/** Recursively collect the anchor slugs (href without the leading #). */
function collectSlugs(
  headings: readonly ProcessedHeading[],
  acc: string[] = []
): string[] {
  for (const heading of headings) {
    const slug = heading.href.replace(/^#/, "");
    if (slug) {
      acc.push(slug);
    }
    if (heading.children.length > 0) {
      collectSlugs(heading.children, acc);
    }
  }
  return acc;
}

/** Smooth-scroll to a heading, leaving room for the sticky navbar. */
function scrollToHeading(slug: string) {
  const element = document.getElementById(slug);
  if (!element) {
    return;
  }
  const top =
    element.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;
  window.scrollTo({ top, behavior: "smooth" });
  window.history.replaceState(null, "", `#${slug}`);
}

/**
 * Track which heading is currently in view for the active TOC underline.
 * Returns the active slug plus a setter so clicks can highlight immediately.
 */
function useActiveSlug(
  slugs: string[]
): [string | null, (slug: string) => void] {
  const key = slugs.join("|");
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  useEffect(() => {
    const ids = key ? key.split("|") : [];
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) {
      return;
    }

    // Highlight the first section up front so something is always active.
    setActiveSlug((prev) => prev ?? ids[0] ?? null);

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length === 0) {
          return;
        }
        const topMost = visible.reduce((closest, entry) =>
          entry.boundingClientRect.top < closest.boundingClientRect.top
            ? entry
            : closest
        );
        setActiveSlug(topMost.target.id);
      },
      // Activate a heading once it reaches just below the sticky navbar.
      { rootMargin: `-${SCROLL_OFFSET}px 0px -66% 0px`, threshold: 0 }
    );

    for (const element of elements) {
      observer.observe(element);
    }
    return () => observer.disconnect();
  }, [key]);

  return [activeSlug, setActiveSlug];
}

// ============================================================================
// COMPONENTS
// ============================================================================

const TableOfContentAnchor: FC<AnchorProps> = ({
  heading,
  maxDepth = DEFAULT_MAX_DEPTH,
  currentDepth = 1,
  activeSlug,
  onSelect,
}) => {
  const { href, text, children, isChild } = heading;

  // Don't render if we're at max depth and this is a child
  if (currentDepth > maxDepth) {
    return null;
  }

  // Don't render if text or href is invalid
  if (!(text?.trim() && href?.trim())) {
    return null;
  }

  const hasChildren =
    Array.isArray(children) && children.length > 0 && currentDepth < maxDepth;
  const slug = href.replace(/^#/, "");
  const isActive = activeSlug !== null && slug === activeSlug;

  return (
    <li className={cn(isChild && "ml-4")}>
      <Link
        aria-current={isActive ? "location" : undefined}
        className={cn(
          "block py-1 text-base leading-6 transition-colors",
          isActive
            ? "text-foreground underline underline-offset-4"
            : "text-muted-foreground hover:text-foreground"
        )}
        href={href}
        onClick={(event) => {
          event.preventDefault();
          onSelect(slug);
          scrollToHeading(slug);
        }}
      >
        {text}
      </Link>

      {hasChildren && (
        <ul>
          {children.map((child, index) => (
            <TableOfContentAnchor
              activeSlug={activeSlug}
              currentDepth={currentDepth + 1}
              heading={child}
              key={child.id || `${child.text}-${index}-${currentDepth}`}
              maxDepth={maxDepth}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
};

export const TableOfContent: FC<TableOfContentProps> = ({
  richText,
  className,
  maxDepth = DEFAULT_MAX_DEPTH,
}) => {
  const { shouldShow, headings, error } = useTableOfContentState(
    richText,
    maxDepth
  );

  const slugs = useMemo(() => collectSlugs(headings), [headings]);
  const [activeSlug, setActiveSlug] = useActiveSlug(slugs);

  // Early return for error state
  if (error) {
    return null;
  }

  // Early return if nothing to show
  if (!shouldShow || headings.length === 0) {
    return null;
  }

  return (
    <nav
      aria-labelledby="toc-heading"
      className={cn("flex flex-col", className)}
    >
      <p className="mb-6 text-foreground text-lg leading-7" id="toc-heading">
        On this page
      </p>
      <ul className="flex flex-col gap-1">
        {headings.map((heading, index) => (
          <TableOfContentAnchor
            activeSlug={activeSlug}
            currentDepth={1}
            heading={heading}
            key={heading.id || `${heading.text}-${index}`}
            maxDepth={maxDepth}
            onSelect={setActiveSlug}
          />
        ))}
      </ul>
    </nav>
  );
};
