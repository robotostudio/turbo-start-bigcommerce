import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion";
import Link from "next/link";
import { PortableText, type PortableTextReactComponents } from "next-sanity";

import { ProductHotspotsImage } from "@/components/product/product-hotspots";

const linkClassName =
  "font-medium text-foreground underline decoration-solid underline-offset-2";

/**
 * Link annotations, shared by `RichText` and by the accordion's nested
 * `PortableText` below. `@portabletext/react` resolves components per render
 * call — a nested render inherits nothing — so a nested body without these
 * renders every annotation through `unknownMark`: a bare span, no href.
 */
export const sharedPortableTextMarks: NonNullable<
  Partial<PortableTextReactComponents>["marks"]
> = {
  code: ({ children }) => (
    <code className="border border-border bg-muted px-1.5 py-0.5 text-foreground text-sm lg:whitespace-nowrap">
      {children}
    </code>
  ),
  customLink: ({ children, value }) => {
    if (!value.href || value.href === "#") {
      return <span className={linkClassName}>Link Broken</span>;
    }
    return (
      <Link
        aria-label={`Link to ${value?.href}`}
        className={linkClassName}
        href={value.href}
        prefetch={false}
        target={value.openInNewTab ? "_blank" : "_self"}
      >
        {children}
      </Link>
    );
  },
  linkInternal: ({ children, value }) => {
    if (!value?.href) return <span>{children}</span>;
    return (
      <Link className={linkClassName} href={value.href} prefetch={false}>
        {children}
      </Link>
    );
  },
  linkExternal: ({ children, value }) => {
    if (!value?.href) return <span>{children}</span>;
    return (
      <Link
        className={linkClassName}
        href={value.href}
        prefetch={false}
        rel={value.openInNewTab ? "noopener noreferrer" : undefined}
        target={value.openInNewTab ? "_blank" : "_self"}
      >
        {children}
      </Link>
    );
  },
  linkEmail: ({ children, value }) => {
    if (!value?.href) return <span>{children}</span>;
    return (
      <a className={linkClassName} href={value.href}>
        {children}
      </a>
    );
  },
};

/**
 * Instagram's share button includes the username, so `/p/<id>` and
 * `/<username>/p/<id>` are both valid; reels and IGTV embed the same way.
 * Mirrors the validation on the `instagram` schema
 * (apps/studio/schemaTypes/objects/module/instagram.ts).
 */
const INSTAGRAM_POST_ID =
  /instagram\.com\/(?:[^/?#]+\/)?(?:p|reel|tv)\/([^/?#&]+)/;

export function InstagramEmbed({ url }: { url?: string | null }) {
  const postId = url?.match(INSTAGRAM_POST_ID)?.[1];
  if (!postId) return null;

  return (
    <div className="my-8 flex justify-center">
      <iframe
        className="aspect-[4/5] w-full max-w-[540px] border-0"
        loading="lazy"
        src={`https://www.instagram.com/p/${postId}/embed`}
        title="Instagram post"
      />
    </div>
  );
}

/**
 * Portable Text blocks shared by the product body and blog rich text. Both
 * fields permit these types, so both need to render them — an unhandled type
 * falls back to a `display: none` div and vanishes silently.
 */
export const sharedPortableTextTypes: NonNullable<
  Partial<PortableTextReactComponents>["types"]
> = {
  imageWithProductHotspots: ({ value }) => {
    if (!value?.image) return null;
    return (
      <div className="my-6">
        <ProductHotspotsImage
          image={value.image}
          productHotspots={value.productHotspots}
          showHotspots={value.showHotspots}
        />
      </div>
    );
  },
  accordion: ({ value }) => {
    if (!value?.groups?.length) return null;
    return (
      <Accordion className="my-4" collapsible type="single">
        {value.groups.map(
          (group: {
            _key: string;
            title: string;
            // biome-ignore lint/suspicious/noExplicitAny: Portable Text blocks from Sanity
            body: any[];
          }) => (
            <AccordionItem key={group._key} value={group._key}>
              <AccordionTrigger>{group.title}</AccordionTrigger>
              <AccordionContent>
                {group.body && (
                  <div className="prose prose-sm dark:prose-invert">
                    <PortableText
                      components={{ marks: sharedPortableTextMarks }}
                      value={group.body}
                    />
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          )
        )}
      </Accordion>
    );
  },
  callout: ({ value }) => {
    if (!value?.text) return null;
    return (
      <div className="my-4 border bg-muted/50 p-4">
        <p className="text-sm">{value.text}</p>
      </div>
    );
  },
  instagram: ({ value }) => <InstagramEmbed url={value?.url} />,
};
