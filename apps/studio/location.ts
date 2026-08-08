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
  //
  // A category takes its href from `store.path` instead, for the reason
  // `categoryHandle` in `packages/sanity/src/query.ts` documents: the slug
  // flattens a nested path into one segment, so Open Preview on Henleys opened
  // `/collections/tops-henleys` and 404d. Both are selected because `path` is
  // absent until the sync that introduced it runs.
  bigcommerceCategory: defineLocations({
    select: {
      title: "store.title",
      slug: "store.slug.current",
      path: "store.path",
    },
    resolve: (doc) =>
      doc?.slug
        ? {
            locations: [
              {
                title: doc?.title || "Untitled",
                href: `/collections/${doc.path || doc.slug}`,
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
