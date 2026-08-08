import { LayoutGrid } from "lucide-react";
import { defineField, defineType } from "sanity";

import { buttonsField } from "@/schemaTypes/common";

export const exploreCategories = defineType({
  name: "exploreCategories",
  title: "Explore Categories",
  icon: LayoutGrid,
  type: "object",
  description:
    "A grid of collection categories with a heading and optional call-to-action. Falls back to the first four top-level categories when none are picked.",
  fields: [
    defineField({
      name: "title",
      type: "string",
      title: "Title",
      description: "The main heading text (e.g. 'Explore Categories')",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "collections",
      title: "Categories",
      // The registered `collectionLinks` type, not a fresh array: it is already
      // up to four unique weak references to `bigcommerceCategory` carrying
      // `catalogReferenceOptions`, which is exactly this field. Four is also
      // what the grid lays out (`md:grid-cols-4`).
      type: "collectionLinks",
      description:
        "Pick up to 4 categories. Leave empty to automatically show the first four top-level categories, in alphabetical order.",
    }),
    buttonsField,
  ],
  preview: {
    /**
     * Indexed leaf paths, one per slot, for the reason recorded on Featured
     * Products: a preview `select` resolves `collections.0.store.title` but
     * neither `collections.length` nor the array itself, so counting any other
     * way reports "automatic" on a block that has picks.
     */
    select: {
      title: "title",
      title0: "collections.0.store.title",
      title1: "collections.1.store.title",
      title2: "collections.2.store.title",
      title3: "collections.3.store.title",
    },
    prepare: ({ title, title0, title1, title2, title3 }) => {
      const picked = [title0, title1, title2, title3].filter(Boolean);
      return {
        title: title || "Explore Categories",
        subtitle: picked.length
          ? `${picked.length} hand-picked: ${picked.join(", ")}`
          : "Top-level categories (automatic)",
        media: LayoutGrid,
      };
    },
  },
});
