import { Star } from "lucide-react";
import { defineField, defineType } from "sanity";

import { storeThumb } from "@/components/store-thumb";

export const featuredProducts = defineType({
  name: "featuredProducts",
  type: "object",
  icon: Star,
  title: "Featured Products",
  description:
    "A grid of hand-picked products. Falls back to the newest products when none are selected.",
  fields: [
    defineField({
      name: "heading",
      title: "Heading",
      type: "string",
      description: "The section heading shown above the product grid",
      initialValue: "Featured Products",
    }),
    defineField({
      name: "products",
      title: "Products",
      type: "array",
      description:
        "Pick up to 4 products to feature. Leave empty to automatically show the newest products.",
      of: [
        {
          type: "reference",
          to: [{ type: "bigcommerceProduct" }],
          options: { disableNew: true },
          weak: true,
        },
      ],
      validation: (Rule) => Rule.max(4),
    }),
  ],
  preview: {
    /**
     * Counted by index, one path per slot, because a preview `select` resolves
     * indexed leaf paths but neither `products.length` nor the array itself —
     * both come back undefined. The old `products.length` path meant the row
     * read "(auto)" even with four products picked, telling an editor the block
     * was on automatic when it was not. Four paths is not elegant; it is
     * bounded by the field's own `Rule.max(4)` and it is correct.
     */
    select: {
      heading: "heading",
      title0: "products.0.store.title",
      title1: "products.1.store.title",
      title2: "products.2.store.title",
      title3: "products.3.store.title",
      // First pick only: four thumbnails will not fit a list row, and the
      // first is enough to tell two Featured Products blocks apart.
      firstImageUrl: "products.0.store.previewImageUrl",
    },
    prepare: ({ heading, title0, title1, title2, title3, firstImageUrl }) => {
      const picked = [title0, title1, title2, title3].filter(Boolean);
      return {
        title: heading || "Featured Products",
        subtitle: picked.length
          ? `${picked.length} hand-picked: ${picked.join(", ")}`
          : "Newest products (automatic)",
        media: storeThumb(firstImageUrl, String(title0 ?? "Featured product")),
      };
    },
  },
});
