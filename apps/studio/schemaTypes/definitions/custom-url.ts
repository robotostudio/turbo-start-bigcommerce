import { defineField, defineType } from "sanity";

import { catalogReferenceOptions } from "@/schemaTypes/objects/bigcommerce/catalog-reference";
import { createRadioListLayout, isValidUrl } from "@/utils/helper";

const allLinkableTypes = [
  { type: "blog" },
  { type: "blogIndex" },
  { type: "page" },
  { type: "bigcommerceProduct" },
  { type: "bigcommerceCategory" },
];

export const customUrl = defineType({
  name: "customUrl",
  title: "URL",
  type: "object",
  description:
    "A link to an internal page, external URL, email address, or product",
  fields: [
    defineField({
      name: "type",
      title: "Link Type",
      type: "string",
      description: "Choose what kind of link this is",
      options: createRadioListLayout(
        ["internal", "external", "email", "product"],
        { direction: "horizontal" }
      ),
      initialValue: "external",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "openInNewTab",
      title: "Open in new tab",
      type: "boolean",
      description: "Open the destination in a new browser tab",
      initialValue: false,
    }),
    // --- External URL ---
    defineField({
      name: "external",
      title: "URL",
      type: "string",
      description: "Full URL (https://...) or relative path (/about)",
      hidden: ({ parent }) => parent?.type !== "external",
      validation: (Rule) =>
        Rule.custom((value, { parent }) => {
          const type = (parent as { type?: string })?.type;
          if (type === "external") {
            if (!value) return "URL is required";
            if (!isValidUrl(value)) return "Invalid URL";
          }
          return true;
        }),
    }),
    // --- Internal Reference ---
    defineField({
      name: "internal",
      title: "Page",
      type: "reference",
      description: "Select an internal page",
      options: catalogReferenceOptions,
      hidden: ({ parent }) => parent?.type !== "internal",
      to: allLinkableTypes,
      /**
       * Weak, and this one costs something — read before reverting it.
       *
       * `allLinkableTypes` spans both halves of the content model: synced
       * catalog documents, which arrive from `pnpm sync:bigcommerce` after the
       * content import that links to them, and editorial documents (`page`,
       * `blog`, `blogIndex`), which do not. A strong reference is impossible
       * for the first group — `sanity dataset import` fails at "Strengthening
       * references" for any target outside the import set — and the field
       * cannot be strong for some targets and weak for others.
       *
       * What is lost: Sanity no longer refuses to delete a `page` or `blog`
       * that a navbar link, promo banner or button points at. The link is left
       * dangling and the storefront renders it as an inert element rather than
       * a broken route, because every href is built from a dereferenced slug
       * that is now null.
       *
       * What is bought: no "Reference strength mismatch" on a fresh install.
       * The seed stores all 14 of these weakly, so a strong declaration flags
       * every navbar link, the promo banner and the collections index the
       * moment a fork opens the Studio — and the "Convert to strong reference"
       * button offered alongside it breaks the next seed-and-sync cycle.
       */
      weak: true,
      validation: (Rule) =>
        Rule.custom((value, { parent }) => {
          const type = (parent as { type?: string })?.type;
          if (type === "internal" && !value?._ref) {
            return "Select an internal page";
          }
          return true;
        }),
    }),
    // --- Email ---
    defineField({
      name: "email",
      title: "Email Address",
      type: "string",
      description: "Email address for mailto: link",
      hidden: ({ parent }) => parent?.type !== "email",
      validation: (Rule) =>
        Rule.custom((value, { parent }) => {
          const type = (parent as { type?: string })?.type;
          if (type === "email" && !value) {
            return "Email address is required";
          }
          return true;
        }),
    }),
    // --- Product ---
    defineField({
      name: "product",
      title: "Product",
      type: "reference",
      description: "Select a product to link to",
      to: [{ type: "bigcommerceProduct" }],
      // Weak for the same reason as every other reference into the synced
      // catalog: the documents arrive after the content that links to them.
      weak: true,
      options: catalogReferenceOptions,
      hidden: ({ parent }) => parent?.type !== "product",
      validation: (Rule) =>
        Rule.custom((value, { parent }) => {
          const type = (parent as { type?: string })?.type;
          if (type === "product" && !value?._ref) {
            return "Select a product";
          }
          return true;
        }),
    }),
    // --- Hidden href (internal use) ---
    defineField({
      name: "href",
      type: "string",
      initialValue: "#",
      hidden: true,
      readOnly: true,
    }),
  ],
  preview: {
    select: {
      urlType: "type",
      externalUrl: "external",
      internalUrl: "internal.slug.current",
      email: "email",
      productTitle: "product.store.title",
      openInNewTab: "openInNewTab",
    },
    prepare({
      urlType,
      externalUrl,
      internalUrl,
      email,
      productTitle,
      openInNewTab,
    }) {
      const newTab = openInNewTab ? " ↗" : "";
      const labels: Record<string, string> = {
        internal: `Internal: ${internalUrl ?? "unset"}`,
        external: `External: ${externalUrl ?? "unset"}`,
        email: `Email: ${email ?? "unset"}`,
        product: `Product: ${productTitle ?? "unset"}`,
      };
      return {
        title: `${urlType ?? "unknown"} link`,
        subtitle: `${labels[urlType ?? ""] ?? ""}${newTab}`,
      };
    },
  },
});
