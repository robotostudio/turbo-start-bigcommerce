import { Columns2 } from "lucide-react";
import { defineArrayMember, defineField, defineType } from "sanity";

import { storeThumb } from "@/components/store-thumb";

const editorialItem = defineArrayMember({
  name: "editorialItem",
  type: "object",
  icon: Columns2,
  description: "A collection shown as a tall editorial image",
  fields: [
    defineField({
      name: "swatchColor",
      title: "Swatch Color",
      type: "string",
      description:
        "Hex color for the small square shown before the collection name (e.g. #4b5320)",
    }),
    defineField({
      name: "collection",
      title: "Collection",
      type: "reference",
      to: [{ type: "bigcommerceCategory" }],
      // Weak for the same reason as `layersShowcase.product`: the category
      // documents arrive from the sync, after the content import that
      // references them.
      weak: true,
      options: { disableNew: true },
      description:
        "The collection this column links to — its image and name are used automatically",
      validation: (Rule) => Rule.required(),
    }),
  ],
  preview: {
    select: {
      title: "collection.store.title",
      // See `layersShowcase`: names the missing target instead of leaving the
      // row blank when the referenced category is gone.
      ref: "collection._ref",
      imageUrl: "collection.store.imageUrl",
      swatchColor: "swatchColor",
    },
    prepare: ({ title, ref, imageUrl, swatchColor }) => ({
      title: title || (ref ? `Missing category: ${ref}` : "Editorial Item"),
      subtitle: swatchColor ? `Swatch ${swatchColor}` : "No swatch colour",
      media: storeThumb(imageUrl, title ?? "Category"),
    }),
  },
});

export const editorialTwoUp = defineType({
  name: "editorialTwoUp",
  type: "object",
  icon: Columns2,
  title: "Editorial Two-Up",
  description:
    "Two side-by-side collections, each shown as a tall editorial image with a swatch caption",
  fields: [
    defineField({
      name: "items",
      title: "Items",
      type: "array",
      of: [editorialItem],
      description: "Add exactly two collections for the side-by-side layout",
      validation: (Rule) => Rule.length(2).error("Add exactly two items"),
    }),
  ],
  preview: {
    // Was `items.0.caption` / `items.1.caption`, which never resolved: an
    // editorial item has a swatch colour and a category, and never had a
    // `caption`. The subtitle was therefore always the "Two columns"
    // fallback, so the row never said which two categories it showed.
    select: {
      item0: "items.0.collection.store.title",
      item1: "items.1.collection.store.title",
      imageUrl: "items.0.collection.store.imageUrl",
    },
    prepare: ({ item0, item1, imageUrl }) => ({
      title: "Editorial Two-Up",
      subtitle: [item0, item1].filter(Boolean).join(" • ") || "No categories",
      media: storeThumb(imageUrl, item0 ?? "Category"),
    }),
  },
});
