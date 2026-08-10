import { LayoutPanelLeft, Link, PanelBottom } from "lucide-react";
import { defineField, defineType } from "sanity";

const footerColumnLink = defineField({
  name: "footerColumnLink",
  type: "object",
  icon: Link,
  fields: [
    defineField({
      name: "name",
      type: "string",
      title: "Name",
      description: "Name for the link",
    }),
    defineField({
      name: "url",
      type: "customUrl",
      description: "Where this link takes visitors when clicked",
    }),
  ],
  preview: {
    select: {
      title: "name",
      externalUrl: "url.external",
      urlType: "url.type",
      internalUrl: "url.internal.slug.current",
      // Synced catalog documents keep their slug under `store`, editorial
      // documents keep it at the top level. A link can point at either.
      internalStoreUrl: "url.internal.store.slug.current",
      openInNewTab: "url.openInNewTab",
    },
    prepare({
      title,
      externalUrl,
      urlType,
      internalUrl,
      internalStoreUrl,
      openInNewTab,
    }) {
      const url =
        urlType === "external"
          ? externalUrl
          : (internalUrl ?? internalStoreUrl);
      const newTabIndicator = openInNewTab ? " ↗" : "";
      const label = url ?? "unset";
      const truncatedUrl =
        label.length > 30 ? `${label.substring(0, 30)}...` : label;

      return {
        title: title || "Untitled Link",
        subtitle: `${urlType === "external" ? "External" : "Internal"} • ${truncatedUrl}${newTabIndicator}`,
        media: Link,
      };
    },
  },
});

const footerColumn = defineField({
  name: "footerColumn",
  type: "object",
  icon: LayoutPanelLeft,
  fields: [
    defineField({
      name: "title",
      type: "string",
      title: "Title",
      description:
        "The heading text displayed above this group of footer links",
    }),
    defineField({
      name: "links",
      type: "array",
      title: "Links",
      description: "The navigation links displayed in this footer column",
      of: [footerColumnLink],
    }),
  ],
  preview: {
    select: {
      title: "title",
      links: "links",
    },
    prepare({ title, links = [] }) {
      return {
        title: title || "Untitled Column",
        subtitle: `${links.length} link${links.length === 1 ? "" : "s"}`,
      };
    },
  },
});

export const footer = defineType({
  name: "footer",
  type: "document",
  title: "Footer",
  description: "Footer content for your website",
  fields: [
    defineField({
      name: "label",
      type: "string",
      initialValue: "Footer",
      title: "Label",
      description: "Label used to identify footer in the CMS",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "subtitle",
      type: "text",
      rows: 2,
      title: "Subtitle",
      description: "Subtitle that sits beneath the logo in the footer",
    }),
    defineField({
      name: "backgroundImage",
      type: "image",
      title: "Background Image",
      description:
        "Optional background image displayed in the footer (works best with a subtle, faded image)",
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: "columns",
      type: "array",
      title: "Columns",
      description: "The link columns that organize your footer navigation",
      of: [footerColumn],
    }),
  ],
  preview: {
    select: {
      title: "label",
    },
    prepare: ({ title }) => ({
      title: title || "Untitled Footer",
      media: PanelBottom,
    }),
  },
});
