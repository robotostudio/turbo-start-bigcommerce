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
  // Synced BigCommerce documents keep their handle under `store.slug.current`,
  // and it is a bare handle — unlike page/blog slugs, the route prefix is not
  // baked in by `createSlug`.
  bigcommerceCategory: defineLocations({
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
  bigcommerceProduct: defineLocations({
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
