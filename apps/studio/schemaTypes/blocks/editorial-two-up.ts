import { Columns2 } from "lucide-react";
import { defineArrayMember, defineField, defineType } from "sanity";

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
      to: [{ type: "collection" }],
      options: { disableNew: true },
      description:
        "The collection this column links to — its image and name are used automatically",
      validation: (Rule) => Rule.required(),
    }),
  ],
  preview: {
    select: {
      title: "collection.store.title",
    },
    prepare: ({ title }) => ({
      title: title || "Editorial Item",
      subtitle: "Editorial Item",
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
    select: {
      item0: "items.0.caption",
      item1: "items.1.caption",
    },
    prepare: ({ item0, item1 }) => ({
      title: "Editorial Two-Up",
      subtitle: [item0, item1].filter(Boolean).join("  •  ") || "Two columns",
    }),
  },
});
