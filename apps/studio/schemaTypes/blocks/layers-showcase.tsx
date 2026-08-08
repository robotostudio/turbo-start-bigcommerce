import { LayoutGrid } from "lucide-react";
import { defineField, defineType } from "sanity";

import { storeThumb } from "@/components/store-thumb";
import { catalogReferenceOptions } from "@/schemaTypes/objects/bigcommerce/catalog-reference";

export const layersShowcase = defineType({
  name: "layersShowcase",
  type: "object",
  icon: LayoutGrid,
  title: "Layers Showcase",
  description:
    "A collage built from a product's images beside the large product with add-to-cart",
  fields: [
    defineField({
      name: "heading",
      title: "Heading",
      type: "text",
      rows: 2,
      description:
        'The collage heading (e.g. "Layers of the Season"). Line breaks are preserved.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "text",
      rows: 2,
      description: "Supporting text shown beside the heading",
    }),
    defineField({
      name: "product",
      title: "Featured Product",
      type: "reference",
      to: [{ type: "bigcommerceProduct" }],
      // Weak, like every reference into the synced catalog. The seed imports
      // content before `pnpm sync:bigcommerce` writes the product documents, and
      // `sanity dataset import` rejects a strong reference to a document outside
      // the import set. A strong declaration here makes the Studio flag every
      // seeded homepage with "Reference strength mismatch".
      weak: true,
      options: catalogReferenceOptions,
      description:
        "The collage and the large image are pulled from this product's images, with live price, sizes, and add-to-cart",
      validation: (Rule) => Rule.required(),
    }),
  ],
  preview: {
    select: {
      title: "heading",
      subtitle: "product.store.title",
      // The stored pointer, so a reference whose target is gone can still say
      // which one. Sanity's own empty state is "Document unavailable", which
      // leaves an editor with nothing to search for.
      ref: "product._ref",
      imageUrl: "product.store.previewImageUrl",
    },
    prepare: ({ title, subtitle, ref, imageUrl }) => ({
      // `heading` keeps its line breaks because the storefront honours them; a
      // list row is a single clipped line, so they are collapsed here. (The
      // row also renders empty for a beat while Sanity resolves the
      // `product.*` paths above — that part is the Studio's, not ours.)
      title:
        String(title ?? "")
          .replace(/\s+/g, " ")
          .trim() || "Layers Showcase",
      subtitle: subtitle || (ref ? `Missing product: ${ref}` : "No product"),
      media: storeThumb(imageUrl, "Featured product"),
    }),
  },
});
