import { Logger } from "@workspace/logger";
import { cn } from "@workspace/ui/lib/utils";
import { PortableText, type PortableTextReactComponents } from "next-sanity";

import type { SanityRichTextProps } from "@/types";
import { parseChildrenToSlug } from "@/utils";
import {
  sharedPortableTextMarks,
  sharedPortableTextTypes,
} from "./portable-text-types";
import { SanityImage } from "./sanity-image";

const logger = new Logger("RichText");

const components: Partial<PortableTextReactComponents> = {
  block: {
    h2: ({ children, value }) => {
      const slug = parseChildrenToSlug(value.children);
      return (
        <h2
          className="scroll-m-32  font-semibold text-2xl leading-tight tracking-[-0.48px] text-foreground first:mt-0 [&_strong]:font-semibold!"
          id={slug}
        >
          {children}
        </h2>
      );
    },
    h3: ({ children, value }) => {
      const slug = parseChildrenToSlug(value.children);
      return (
        <h3
          className="scroll-m-32  font-semibold text-2xl leading-tight tracking-[-0.48px] text-foreground [&_strong]:font-semibold!"
          id={slug}
        >
          {children}
        </h3>
      );
    },
    h4: ({ children, value }) => {
      const slug = parseChildrenToSlug(value.children);
      return (
        <h4
          className="scroll-m-32  font-semibold text-xl [&_strong]:font-semibold!"
          id={slug}
        >
          {children}
        </h4>
      );
    },
    h5: ({ children, value }) => {
      const slug = parseChildrenToSlug(value.children);
      return (
        <h5
          className="scroll-m-32  font-semibold text-lg [&_strong]:font-semibold!"
          id={slug}
        >
          {children}
        </h5>
      );
    },
    h6: ({ children, value }) => {
      const slug = parseChildrenToSlug(value.children);
      return (
        <h6
          className="scroll-m-32  font-semibold text-base [&_strong]:font-semibold!"
          id={slug}
        >
          {children}
        </h6>
      );
    },
    normal: ({ children, value }) => {
      const isFullyBold =
        Array.isArray(value.children) &&
        value.children.length > 0 &&
        value.children.every(
          (c) =>
            "marks" in c && Array.isArray(c.marks) && c.marks.includes("strong")
        );
      if (isFullyBold) {
        const slug = parseChildrenToSlug(value.children);
        return (
          <h3
            className="scroll-m-32  font-semibold text-2xl leading-tight tracking-[-0.48px] text-foreground [&_strong]:font-semibold!"
            id={slug}
          >
            {children}
          </h3>
        );
      }
      return <p>{children}</p>;
    },
  },
  marks: sharedPortableTextMarks,
  types: {
    ...sharedPortableTextTypes,
    image: ({ value }) => {
      if (!value?.id) {
        return null;
      }
      return (
        <figure className="my-8 flex flex-col gap-2">
          <SanityImage
            className="h-auto w-full rounded-xl object-cover"
            height={640}
            image={value}
            width={1600}
          />
          {value?.caption && (
            <figcaption className="text-center text-[13px] leading-[1.4] text-muted-foreground">
              {value.caption}
            </figcaption>
          )}
        </figure>
      );
    },
  },
  hardBreak: () => <br />,
};

export function RichText<T extends SanityRichTextProps>({
  richText,
  className,
}: {
  richText?: T | null;
  className?: string;
}) {
  if (!richText) {
    return null;
  }

  return (
    <div
      className={cn(
        "prose prose-zinc max-w-none prose-headings:scroll-m-32  prose-headings:font-semibold prose-headings:text-foreground prose-h2:text-2xl prose-h2:leading-tight prose-h2:tracking-[-0.48px] prose-h2:first:mt-0 prose-h2:mt-12 prose-h2:mb-8 prose-p:text-foreground prose-p:leading-[1.4] prose-p:mt-0 prose-p:mb-6 prose-ol:text-foreground prose-ul:text-foreground prose-li:text-foreground prose-li:leading-[1.4] prose-li:my-0 prose-li:marker:text-foreground prose-ul:my-4 prose-ol:my-4 prose-strong:text-foreground prose-code:text-foreground prose-a:decoration-solid prose-a:font-medium prose-a:text-foreground",
        className
      )}
    >
      <PortableText
        components={components}
        onMissingComponent={(_, { nodeType, type }) => {
          logger.warn(`Missing component: ${nodeType} for type: ${type}`);
        }}
        value={richText}
      />
    </div>
  );
}
