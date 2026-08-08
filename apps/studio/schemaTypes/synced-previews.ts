import type { DocumentDefinition } from "sanity";

import { storeThumb } from "@/components/store-thumb";

/**
 * Gives the three synced catalog types a list preview with a thumbnail.
 *
 * The definitions come from `@workspace/sanity-sync`, which is a server-side
 * package with no React dependency, so it cannot build the `<img>` a
 * CDN-hosted product image needs — it ships title and subtitle only. That is
 * the right boundary for the package and the wrong experience for an editor:
 * every reference picker in the Studio (Featured Products, the layers block,
 * navbar links) then lists twelve near-identical garment names as plain text,
 * and Sanity's reference input renders the *referenced document's* preview, so
 * this is the only place the thumbnail can come from.
 *
 * Titles, descriptions and field order stay the package's business. This
 * replaces the preview and nothing else.
 */
const SUBTITLES: Record<string, string> = {
  // `store.sku` is empty on every product in the reference catalog, which left
  // product rows with no second line at all. The slug is always present and is
  // what an editor recognises from the storefront URL.
  bigcommerceProduct: "store.slug.current",
  // A variant's SKU is the thing that distinguishes it from its siblings.
  bigcommerceProductVariant: "store.sku",
  bigcommerceCategory: "store.slug.current",
};

const IMAGE_PATHS: Record<string, string> = {
  bigcommerceProduct: "store.previewImageUrl",
  bigcommerceProductVariant: "store.imageUrl",
  bigcommerceCategory: "store.imageUrl",
};

export function withStoreThumbnails(
  types: DocumentDefinition[]
): DocumentDefinition[] {
  return types.map((type) => {
    const subtitle = SUBTITLES[type.name];
    const imageUrl = IMAGE_PATHS[type.name];
    if (!(subtitle && imageUrl)) {
      return type;
    }

    return {
      ...type,
      preview: {
        select: { title: "store.title", subtitle, imageUrl },
        prepare: (selection: Record<string, unknown>) => ({
          title:
            typeof selection.title === "string" ? selection.title : "Untitled",
          subtitle:
            typeof selection.subtitle === "string"
              ? selection.subtitle
              : undefined,
          media: storeThumb(
            selection.imageUrl,
            typeof selection.title === "string" ? selection.title : ""
          ),
        }),
      },
    };
  });
}
