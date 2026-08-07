import { defineLocations } from "sanity/presentation";

export const locations = {
  blog: defineLocations({
    select: {
      title: "title",
      slug: "slug.current",
    },
    resolve: (doc) => ({
      locations: [
        {
          title: doc?.title || "Untitled",
          href: `${doc?.slug}`,
        },
        {
          title: "Blog",
          href: "/blog",
        },
      ],
    }),
  }),
  // Keys must match the document `_type`, or the resolver never fires.
  homePage: defineLocations({
    select: {
      title: "title",
      slug: "slug.current",
    },
    resolve: () => ({
      locations: [
        {
          title: "Home",
          href: "/",
        },
      ],
    }),
  }),
  // Shopify-synced documents keep their handle under `store.slug.current`, and
  // it is a bare handle — unlike page/blog slugs, the route prefix is not
  // baked in by `createSlug`.
  collection: defineLocations({
    select: {
      title: "store.title",
      slug: "store.slug.current",
    },
    resolve: (doc) =>
      doc?.slug
        ? {
            locations: [
              {
                title: doc?.title || "Untitled",
                href: `/collections/${doc.slug}`,
              },
              {
                title: "Collections",
                href: "/collections",
              },
            ],
          }
        : { locations: [] },
  }),
  product: defineLocations({
    select: {
      title: "store.title",
      slug: "store.slug.current",
    },
    resolve: (doc) =>
      doc?.slug
        ? {
            locations: [
              {
                title: doc?.title || "Untitled",
                href: `/products/${doc.slug}`,
              },
            ],
          }
        : { locations: [] },
  }),
  page: defineLocations({
    select: {
      title: "title",
      slug: "slug.current",
    },
    resolve: (doc) => ({
      locations: [
        {
          title: doc?.title || "Untitled",
          href: `${doc?.slug}`,
        },
      ],
    }),
  }),
};
