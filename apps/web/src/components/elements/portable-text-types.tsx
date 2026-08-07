import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion";
import { PortableText, type PortableTextReactComponents } from "next-sanity";

import { ProductHotspotsImage } from "@/components/product/product-hotspots";

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
                    <PortableText value={group.body} />
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
