import { ListChecks } from "lucide-react";
import { defineArrayMember, defineField, defineType } from "sanity";

export const faqCategories = defineType({
  name: "faqCategories",
  type: "object",
  icon: ListChecks,
  description:
    "Category-based FAQ section — a rail of categories, each with its own set of expandable questions and answers",
  fields: [
    defineField({
      name: "title",
      type: "string",
      title: "Title",
      description: "The large text that is the primary focus of the block",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "categories",
      type: "array",
      title: "Categories",
      description:
        "Groups of FAQs. Each category appears in the left rail and its questions in the right column",
      of: [
        defineArrayMember({
          type: "object",
          name: "faqCategory",
          title: "Category",
          icon: ListChecks,
          fields: [
            defineField({
              name: "title",
              type: "string",
              title: "Category Title",
              description: 'The category label (e.g. "Orders & Shipping")',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "faqs",
              type: "array",
              title: "FAQs",
              description: "Select the FAQ items to display in this category",
              of: [
                {
                  type: "reference",
                  to: [{ type: "faq" }],
                  options: { disableNew: true },
                },
              ],
              validation: (Rule) => [Rule.required(), Rule.unique()],
            }),
          ],
          preview: {
            select: {
              title: "title",
              faqs: "faqs",
            },
            prepare: ({ title, faqs }) => ({
              title: title ?? "Untitled category",
              subtitle: `${faqs?.length ?? 0} FAQ${faqs?.length === 1 ? "" : "s"}`,
              media: ListChecks,
            }),
          },
        }),
      ],
      validation: (Rule) => Rule.required().min(1),
    }),
  ],
  preview: {
    select: {
      title: "title",
    },
    prepare: ({ title }) => ({
      title: title ?? "Untitled",
      subtitle: "FAQ Categories",
      media: ListChecks,
    }),
  },
});
