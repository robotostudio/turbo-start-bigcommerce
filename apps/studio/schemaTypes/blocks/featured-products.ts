import { Star } from "lucide-react";
import { defineField, defineType } from "sanity";

export const featuredProducts = defineType({
  name: "featuredProducts",
  type: "object",
  icon: Star,
  title: "Featured Products",
  description:
    "A grid of hand-picked products. Falls back to best-selling products when none are selected.",
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
        "Pick up to 4 products to feature. Leave empty to automatically show best-selling products.",
      of: [
        {
          type: "reference",
          to: [{ type: "product" }],
          options: { disableNew: true },
          weak: true,
        },
      ],
      validation: (Rule) => Rule.max(4),
    }),
  ],
  preview: {
    select: {
      heading: "heading",
      count: "products.length",
    },
    prepare: ({ heading, count }) => ({
      title: heading || "Featured Products",
      subtitle:
        count > 0
          ? `${count} product${count === 1 ? "" : "s"}`
          : "Best-selling (auto)",
    }),
  },
});
