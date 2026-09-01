import { CogIcon } from "lucide-react";
import { defineField, defineType } from "sanity";

const socialLinks = defineField({
  name: "socialLinks",
  title: "Social Media Links",
  description: "Add links to your social media profiles",
  type: "object",
  fields: [
    defineField({
      name: "linkedin",
      title: "LinkedIn URL",
      description: "Full URL to your LinkedIn profile/company page",
      type: "string",
    }),
    defineField({
      name: "facebook",
      title: "Facebook URL",
      description: "Full URL to your Facebook profile/page",
      type: "string",
    }),
    defineField({
      name: "twitter",
      title: "Twitter/X URL",
      description: "Full URL to your Twitter/X profile",
      type: "string",
    }),
    defineField({
      name: "instagram",
      title: "Instagram URL",
      description: "Full URL to your Instagram profile",
      type: "string",
    }),
    defineField({
      name: "youtube",
      title: "YouTube URL",
      description: "Full URL to your YouTube channel",
      type: "string",
    }),
  ],
});

export const settings = defineType({
  name: "settings",
  type: "document",
  title: "Settings",
  description: "Global settings and configuration for your website",
  icon: CogIcon,
  fields: [
    defineField({
      name: "label",
      type: "string",
      initialValue: "Settings",
      title: "Label",
      description: "Label used to identify settings in the CMS",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "siteTitle",
      type: "string",
      title: "Site Title",
      description:
        "The main title of your website, used in browser tabs and SEO",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "siteDescription",
      type: "text",
      title: "Site Description",
      description: "A brief description of your website for SEO purposes",
      validation: (rule) => rule.required().min(50).max(160),
    }),
    defineField({
      name: "logo",
      type: "image",
      title: "Site Logo",
      description: "Upload your website logo",
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: "favicon",
      type: "object",
      title: "Favicon",
      description:
        "The small icon shown in browser tabs and bookmarks. Add both formats or neither — each browser reads only one of them.",
      options: { collapsible: true, collapsed: false },
      // Both or neither: a browser that can't read the format you uploaded
      // keeps the built-in icon, so the site shows two different favicons.
      validation: (rule) =>
        rule.custom((value) => {
          const favicon = value as
            | { svg?: { asset?: unknown }; ico?: { asset?: unknown } }
            | undefined;
          const hasSvg = Boolean(favicon?.svg?.asset);
          const hasIco = Boolean(favicon?.ico?.asset);
          if (hasSvg === hasIco) {
            return true;
          }
          return hasSvg
            ? "Add an ICO too — Safari cannot render an SVG favicon and would keep the built-in one"
            : "Add an SVG too — every other browser prefers it and would keep the built-in one";
        }),
      fields: [
        defineField({
          name: "svg",
          type: "image",
          title: "SVG",
          description:
            "Stays sharp at every size and can adapt to dark mode. Chrome, Firefox and Edge use this; Safari ignores it.",
          // `accept` only filters the picker; drag-drop and the media library
          // bypass it, so validation is the enforcement. Refs end in `-<ext>`.
          options: { accept: "image/svg+xml" },
          validation: (rule) =>
            rule.custom((value) => {
              const ref = (value as { asset?: { _ref?: string } })?.asset?._ref;
              if (!ref) {
                return true;
              }
              return ref.split("-").pop() === "svg"
                ? true
                : "Must be an SVG file";
            }),
        }),
        defineField({
          name: "ico",
          // A file, not an image: Sanity's image pipeline rejects ICO outright,
          // so an image field could never hold one.
          type: "file",
          title: "ICO",
          description:
            "The universal fallback every browser reads, Safari included. Should hold 16, 32 and 48px icons.",
          options: { accept: "image/vnd.microsoft.icon,.ico" },
          validation: (rule) =>
            rule.custom((value) => {
              const ref = (value as { asset?: { _ref?: string } })?.asset?._ref;
              if (!ref) {
                return true;
              }
              return ref.split("-").pop() === "ico"
                ? true
                : "Must be an ICO file";
            }),
        }),
      ],
    }),
    defineField({
      name: "ogImage",
      type: "image",
      title: "Default Social Share Image",
      description:
        "The fallback image shown when a page is shared on social media (Open Graph / Twitter). Used whenever a page has neither its own SEO image nor a generated card. Recommended size 1200×630.",
      options: { hotspot: true },
    }),
    defineField({
      name: "contactEmail",
      type: "string",
      title: "Contact Email",
      description: "Primary contact email address for your website",
      validation: (rule) => rule.email(),
    }),
    socialLinks,
  ],
  preview: {
    select: {
      title: "label",
    },
    prepare: ({ title }) => ({
      title: title || "Untitled Settings",
      media: CogIcon,
    }),
  },
});
