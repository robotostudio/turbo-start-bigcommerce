import { defineArrayMember, defineType } from "sanity";

import { pageBuilderBlocks } from "@/schemaTypes/blocks/index";

export const pagebuilderBlockTypes = pageBuilderBlocks.map(({ name }) => ({
  type: name,
}));

export const pageBuilder = defineType({
  name: "pageBuilder",
  type: "array",
  description:
    "Drag-and-drop page sections that let you assemble pages from reusable content blocks",
  of: pagebuilderBlockTypes.map((block) => defineArrayMember(block)),
  options: {
    insertMenu: {
      // Category filter tabs shown above the block picker. A block may belong
      // to more than one group; blocks in no group still appear under "All".
      groups: [
        {
          name: "heroBanners",
          title: "Hero & Banners",
          of: ["hero", "collectionBanner"],
        },
        {
          name: "content",
          title: "Content",
          of: ["cta", "editorialTwoUp", "featureCardsIcon"],
        },
        {
          name: "cards",
          title: "Cards & Categories",
          of: ["imageLinkCards", "exploreCategories"],
        },
        { name: "faq", title: "FAQ", of: ["faqAccordion", "faqCategories"] },
        {
          name: "commerce",
          title: "Commerce",
          of: ["featuredProducts", "layersShowcase", "subscribeNewsletter"],
        },
      ],
      views: [
        {
          name: "grid",
          previewImageUrl: (schemaTypeName) =>
            `/static/thumbnails/${schemaTypeName}.webp`,
        },
        { name: "list" },
      ],
    },
  },
});
