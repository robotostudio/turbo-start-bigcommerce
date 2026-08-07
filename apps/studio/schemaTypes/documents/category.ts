import {
  orderRankField,
  orderRankOrdering,
} from "@sanity/orderable-document-list";
import { TagIcon } from "lucide-react";
import { defineField, defineType } from "sanity";

export const category = defineType({
  name: "category",
  title: "Category",
  type: "document",
  icon: TagIcon,
  orderings: [orderRankOrdering],
  description:
    "A blog category used to group posts and power the filter list on the blog page.",
  fields: [
    orderRankField({ type: "category" }),
    defineField({
      name: "title",
      type: "string",
      title: "Title",
      description: "The category name shown in the filter list and on cards",
      validation: (Rule) =>
        Rule.required().error("A category title is required"),
    }),
    defineField({
      name: "slug",
      type: "slug",
      title: "Slug",
      description:
        "The value used in the blog filter URL (automatically created from the title)",
      options: {
        source: "title",
        maxLength: 96,
      },
      validation: (Rule) =>
        Rule.required().error("A category slug is required"),
    }),
    defineField({
      name: "description",
      type: "text",
      title: "Description",
      rows: 2,
      description: "An optional short summary of what this category covers",
    }),
  ],
  preview: {
    select: {
      title: "title",
      subtitle: "slug.current",
    },
    prepare: ({ title, subtitle }) => ({
      title: title || "Untitled Category",
      subtitle: subtitle ? `/${subtitle}` : "No slug",
    }),
  },
});
