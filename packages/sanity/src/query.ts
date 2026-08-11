import { defineQuery } from "next-sanity";

const imageFields = /* groq */ `
  "id": asset._ref,
  "preview": asset->metadata.lqip,
  "alt": coalesce(
    alt,
    asset->altText,
    caption,
    asset->originalFilename,
    "untitled"
  ),
  hotspot {
    x,
    y
  },
  crop {
    bottom,
    left,
    right,
    top
  }
` as const;
// Base fragments for reusable query parts
const imageFragment = /* groq */ `
  image {
    ${imageFields}
  }
` as const;

// The one href projection every link shape shares. `at` is the path to the link
// object -- "url.", "link.", or "" inside a `...customLink{}` spread. `fallback`
// is the expression used when no link type matches. Both are required: giving
// `fallback` a default would need an `as F` assertion, which Sanity's typegen
// cannot statically resolve.
//
// Why every fragment below carries `as const`: `sanityFetch` picks a result type
// by looking the query's string-literal type up in the generated `SanityQueries`
// map. A template literal holding a value returned from a function only keeps
// that literal type under `as const`, and it does not propagate -- each level of
// nesting needs its own. Drop one and the queries built from it widen to
// `string`, miss the lookup and silently resolve to an untyped result; typegen
// and lint both still pass, and the only symptom is an `any` far away at the
// call site.
//
// The two catalog arms carry the same visibility clauses the explorer, the
// navbar dropdown and the editorial two-up carry, for the same reason:
// /collections/[...slug] and /products/[...slug] resolve through live
// BigCommerce and `notFound()` when the catalog does not hand the entity back,
// and the storefront API does not hand back a hidden one. `store.isVisible`
// mirrors `is_visible` and `store.isDeleted` is the sync's tombstone
// (`sanity-sync/src/upsert.ts`), so a link built from a document carrying
// either is a link to a 404. This is the shared projection every link surface
// is built from -- navbar, footer, promo banner, buttons, `customLink` marks --
// so the guard belongs here rather than at each of them.
//
// The clause sits inside the second arm of the coalesce, never above it.
// `customUrl.internal` points at `page`, `blog` and `blogIndex` as well as the
// catalog, and an editorial document has no `store` at all -- a guard hoisted
// over the coalesce reads `store.isVisible` as null on every one of them and
// takes down the editorial half of the navbar with it.
//
// A null href is not a new shape for any consumer: a dangling weak reference
// already produces one on main, which `custom-url.ts` documents as the price of
// declaring these references weak. This widens when it fires. It also stays a
// null *field* rather than a null array element, so no dense array needs
// `array::compact` -- `buttons[]`, footer `links[]` and `markDefs[]` keep their
// length and their objects, and the components already fall back on a missing
// href.
//
// `coalesce(store.path, store.slug.current)` is the tail of every category URL
// this file builds, and it is spelled out at each of the four rather than
// factored into a helper -- a second interpolated function inside these
// fragments overflows the typegen parser's stack, which drops eight queries from
// `sanity.types.ts` and reports only a warning. The reason it is not the slug
// alone: `slugFromPath` in `packages/sanity-sync/src/upsert.ts` joins a nested
// category's segments with `-`, so Henleys under Tops reads `tops-henleys`
// while its storefront path is `/collections/tops/henleys/`, and an editor who
// picked it by hand got a 404 (ROB-2576). `store.path` is the same segments
// joined with `/`, written beside the slug by the same sync -- beside, because
// `seed-refs.ts` matches documents by slug through a regex with no `/` in its
// class. The fallback is not padding: `path` lands only once the sync that
// introduced it has run, and until then every top-level category keeps the
// single-segment href it already had.
const hrefFragment = <A extends string, F extends string>(at: A, fallback: F) =>
  /* groq */ `"href": select(
      ${at}type == "internal" => coalesce(
        ${at}internal->slug.current,
        select(
          ${at}internal->store.isDeleted != true && ${at}internal->store.isVisible == true =>
            "/collections/" + coalesce(${at}internal->store.path, ${at}internal->store.slug.current)
        )
      ),
      ${at}type == "external" => ${at}external,
      ${at}type == "email" => "mailto:" + ${at}email,
      ${at}type == "product" => select(
        ${at}product->store.isDeleted != true && ${at}product->store.isVisible == true =>
          "/products/" + ${at}product->store.slug.current
      ),
      ${fallback}
    )` as const;

const customLinkFragment = /* groq */ `
  ...customLink{
    openInNewTab,
    ${hrefFragment("", '"#"')},
  }
` as const;

const markDefsFragment = /* groq */ `
  markDefs[]{
    ...,
    ${customLinkFragment},
    _type == "linkInternal" => {
      "href": reference->slug.current,
    },
    _type == "linkExternal" => {
      "href": url,
      "openInNewTab": newWindow,
    },
    _type == "linkEmail" => {
      "href": "mailto:" + email,
    },
  }
` as const;

const productWithVariantFragment = /* groq */ `
  productWithVariant{
    // Null once the sync tombstones the product, which drops the whole spot:
    // \`ProductHotspotsImage\` already bails on a spot with no product. The
    // alternative is a card that links to a PDP which 404s, and the repo has
    // settled that argument the other way once already — see the comment on the
    // flatMap in \`components/product/featured-cards.ts\`. The sync soft-deletes,
    // so without this the document is still there and still projects happily.
    "product": select(
      product->store.isDeleted != true => product->{
        _id,
        "slug": store.slug.current,
        store{
          // Needed to re-read the image live from BigCommerce at request time,
          // which is what \`previewImageUrl\` below is now only the fallback for.
          // See apps/web/src/lib/bigcommerce/hotspot-images.ts.
          entityId,
          title,
          previewImageUrl,
          // A synced product carries one price, not a min/max range. The
          // hotspot card still reads a range, so it is built here rather than
          // reshaping the card: a marked-down product keeps the pre-markdown
          // figure in \`price\`, which makes it the top of the range.
          "priceRange": {
            "minVariantPrice": coalesce(salePrice, price),
            "maxVariantPrice": price
          }
        }
      }
    ),
    variant->{
      _id,
      store{
        title,
        price,
        imageUrl
      }
    }
  }
` as const;

const productHotspotsFragment = /* groq */ `
  productHotspots[]{
    _key,
    x,
    y,
    ${productWithVariantFragment}
  }
` as const;

/**
 * The member projections shared by the two editorial bodies.
 *
 * `blog.richText` and `bigcommerceProduct.body` accept the same six members —
 * the blog gets them from the `richText` type (`rich-text.ts`), the product from
 * `editorialBody` in `packages/sanity-sync/src/schema.ts`. They used to be
 * projected by two fragments that had drifted, and the drift was invisible:
 * every unhandled member still comes back from the bare `...` spread, just as
 * raw stored data.
 *
 * That is how hotspots in blog posts came to render nothing. `image` arrived as
 * `{_type, asset:{_ref}}` with no `id`, so `ProductHotspotsImage`'s
 * `if (!image.id) return null` fired, and `productWithVariant.product` was still
 * an undereferenced `{_ref}` behind it. Neither failure logged anything.
 *
 * `instagram` is deliberately absent: its only field is a plain `url` string,
 * which survives the spread intact. A case that projects nothing new would read
 * as coverage rather than as a no-op.
 */
const editorialMembersFragment = /* groq */ `
  _type == "block" => {
    ...,
    ${markDefsFragment}
  },
  _type == "image" => {
    ${imageFields},
    "caption": caption
  },
  _type == "imageWithProductHotspots" => {
    _type,
    _key,
    image{${imageFields}},
    showHotspots,
    ${productHotspotsFragment}
  },
  _type == "accordion" => {
    _type,
    _key,
    groups[]{
      _key,
      title,
      body[]{
        ...,
        _type == "block" => {
          ...,
          ${markDefsFragment}
        }
      }
    }
  },
  _type == "callout" => {
    _type,
    _key,
    text
  }
` as const;

const richTextFragment = /* groq */ `
  richText[]{
    ...,
    ${editorialMembersFragment}
  }
` as const;

const blogAuthorFragment = /* groq */ `
  authors[0]->{
    _id,
    name,
    position,
    ${imageFragment}
  }
` as const;

const blogCardFragment = /* groq */ `
  _type,
  _id,
  title,
  description,
  "slug":slug.current,
  orderRank,
  ${imageFragment},
  publishedAt,
  "category": category->{ _id, title, "slug": slug.current },
  ${blogAuthorFragment}
` as const;

const buttonsFragment = /* groq */ `
  buttons[]{
    text,
    variant,
    _key,
    _type,
    "openInNewTab": url.openInNewTab,
    ${hrefFragment("url.", "url.href")},
  }
` as const;

// Page builder block fragments
const collectionBannerBlock = /* groq */ `
  _type == "collectionBanner" => {
    ...,
    ${imageFragment},
    ${buttonsFragment}
  }
` as const;

const ctaBlock = /* groq */ `
  _type == "cta" => {
    ...,
    ${richTextFragment},
    ${buttonsFragment},
  }
` as const;
const imageLinkCardsBlock = /* groq */ `
  _type == "imageLinkCards" => {
    ...,
    ${richTextFragment},
    ${buttonsFragment},
    "cards": array::compact(cards[]{
      ...,
      "openInNewTab": url.openInNewTab,
      ${hrefFragment("url.", "url.href")},
      ${imageFragment},
    })
  }
` as const;

const heroBlock = /* groq */ `
  _type == "hero" => {
    ...,
    ${imageFragment},
    ${buttonsFragment},
    ${richTextFragment}
  }
` as const;

const faqFragment = /* groq */ `
  "faqs": array::compact(faqs[]->{
    title,
    _id,
    _type,
    ${richTextFragment}
  })
` as const;

const faqAccordionBlock = /* groq */ `
  _type == "faqAccordion" => {
    ...,
    ${faqFragment},
    link{
      ...,
      "openInNewTab": url.openInNewTab,
      ${hrefFragment("url.", "url.href")}
    }
  }
` as const;

const faqCategoriesBlock = /* groq */ `
  _type == "faqCategories" => {
    ...,
    categories[]{
      _key,
      title,
      ${faqFragment}
    }
  }
` as const;

const subscribeNewsletterBlock = /* groq */ `
  _type == "subscribeNewsletter" => {
    ...,
    "subTitle": subTitle[]{
      ...,
      ${markDefsFragment}
    },
    "helperText": helperText[]{
      ...,
      ${markDefsFragment}
    },
    ${imageFragment}
  }
` as const;

/**
 * Both branches of the explore-categories fallback project this, byte for byte.
 * They have to: the two arrive at the same `Collection` type in
 * `sections/explore-categories.tsx` and feed the same `CollectionCard`, and a
 * key that exists on one branch only widens the generated type into a union
 * that nothing downstream expects.
 *
 * `slug` keeps its name and carries the URL tail (see `hrefFragment`), because
 * that is the only thing its consumer does with it: `sanityCollectionToCardProps`
 * passes it straight to `CollectionCard`'s `handle` and the card renders
 * `/collections/{handle}`. Cards key on `_id`.
 */
const categoryCardFields = /* groq */ `
  _id,
  "title": store.title,
  "slug": coalesce(store.path, store.slug.current),
  "imageUrl": store.imageUrl,
` as const;

const exploreCategoriesBlock = /* groq */ `
  _type == "exploreCategories" => {
    ...,
    ${buttonsFragment},
    // Picked, else automatic — the shape Featured Products already uses and the
    // README already documents. The guard is count() > 0 rather than
    // defined(collections), because an editor who adds picks and then removes
    // them leaves an empty array behind, and defined([]) is true. On an absent
    // field count(null) > 0 evaluates to null, which select() treats as no match
    // and falls through — verified against the live dataset, not assumed.
    "collections": select(
      // A picked category the sync has since tombstoned or the merchant has
      // hidden drops out, and if every pick is dead the block renders nothing
      // rather than reverting to the automatic row. Same call as the hotspot
      // spot-drop and featured-cards.ts: showing an editor four categories they
      // did not choose, because the ones they did choose quietly died, is worse
      // than showing none.
      //
      // isVisible is spelled == true rather than != false, and the strictness
      // is the point: /collections/[...slug] resolves against live BigCommerce,
      // which omits a hidden category from its tree, so a card this block links
      // on a null flag is a card pointing at a 404 — the shape featured-cards.ts
      // rules out for products.
      //
      // array::compact for the other half of the same problem: these references
      // are weak, so the target may not exist at all rather than merely being
      // tombstoned — which is the normal state of a fresh install between the
      // content import and the first sync. The filter does not catch that one.
      // A missing document makes store.isDeleted null, null != true is true, so
      // the reference passes and the deref then yields null straight into the
      // array. featuredProductsBlock compacts the identical shape for the
      // identical reason. It stays after the isVisible clause: the clause is
      // about what the merchant published, compact is about whether the target
      // document exists, and neither answers the other's question.
      count(collections) > 0 => array::compact(collections[@->store.isDeleted != true && @->store.isVisible == true]->{${categoryCardFields}}),
      // The parentEntityId clause is what makes "top-level" true rather than
      // accidental. Every synced category is flat today (ROB-2566), so it
      // filters nothing yet; the moment parentage lands in the sync, without it
      // this block starts returning subcategories.
      //
      // Ordered by title because BigCommerce's own sortOrder reaches the seed
      // fixture but is never mapped into the synced document — see
      // toCategoryDocument in packages/sanity-sync/src/upsert.ts. Using it would
      // need a schema change and a re-sync. Title order is at least a decision;
      // the _id order it replaces was an accident of insertion.
      *[
        _type == "bigcommerceCategory"
        && defined(store.slug.current)
        && store.isDeleted != true
        && store.isVisible == true
        && !defined(store.parentEntityId)
      ] | order(store.title asc) [0...4]{${categoryCardFields}}
    )
  }
` as const;

const featureCardsIconBlock = /* groq */ `
  _type == "featureCardsIcon" => {
    ...,
    ${richTextFragment},
    "cards": array::compact(cards[]{
      ...,
      ${richTextFragment},
    })
  }
` as const;

const editorialTwoUpBlock = /* groq */ `
  _type == "editorialTwoUp" => {
    ...,
    "items": array::compact(items[]{
      ...,
      swatchColor,
      "collectionTitle": collection->store.title,
      "collectionImage": collection->store.imageUrl,
      // Same visibility rule as the explorer, for the same reason:
      // /collections/[...slug] resolves against live BigCommerce, which omits a
      // hidden category from its tree, so a card linking one is a link to a 404.
      //
      // The clause replaces defined(collection) rather than joining it. A weak
      // reference whose target is gone reads store.isVisible as null, null ==
      // true is false, and the select falls through to null — which is what
      // defined(collection) was there to produce, and what the block already
      // renders as an unlinked card. The card keeps the title and image the
      // last sync wrote: a stale name is a smaller lie than a link that 404s,
      // and dropping the item would leave one column in a layout the schema
      // validates as exactly two.
      "collectionHref": select(
        collection->store.isDeleted != true && collection->store.isVisible == true => "/collections/" + coalesce(collection->store.path, collection->store.slug.current),
        null
      ),
    })
  }
` as const;

const layersShowcaseBlock = /* groq */ `
  _type == "layersShowcase" => {
    ...,
    heading,
    description,
    "productHandle": product->store.slug.current,
    "productTitle": product->store.title,
  }
` as const;

const featuredProductsBlock = /* groq */ `
  _type == "featuredProducts" => {
    ...,
    heading,
    "productHandles": array::compact(products[]->store.slug.current)
  }
` as const;

const pageBuilderFragment = /* groq */ `
  pageBuilder[]{
    ...,
    _type,
    ${collectionBannerBlock},
    ${ctaBlock},
    ${editorialTwoUpBlock},
    ${exploreCategoriesBlock},
    ${heroBlock},
    ${faqAccordionBlock},
    ${faqCategoriesBlock},
    ${featureCardsIconBlock},
    ${featuredProductsBlock},
    ${layersShowcaseBlock},
    ${subscribeNewsletterBlock},
    ${imageLinkCardsBlock}
  }
` as const;

/**
 * Query to extract a single image from a page document
 * This is used as a type reference only and not for actual data fetching
 * Helps with TypeScript inference for image objects
 */
export const queryImageType = defineQuery(`
  *[_type == "page" && defined(image)][0]{
    ${imageFragment}
  }.image
`);

export const queryHomePageData =
  defineQuery(`*[_type == "homePage" && _id == "homePage"][0]{
    ...,
    _id,
    _type,
    "slug": slug.current,
    title,
    description,
    ${pageBuilderFragment}
  }`);

export const querySlugPageData = defineQuery(`
  *[_type == "page" && slug.current == $slug][0]{
    ...,
    "slug": slug.current,
    ${pageBuilderFragment}
  }
  `);

export const querySlugPagePaths = defineQuery(`
  *[_type == "page" && defined(slug.current)].slug.current
`);

export const queryBlogIndexPageData = defineQuery(`
  *[_type == "blogIndex"][0]{
    ...,
    _id,
    _type,
    title,
    description,
    "displayFeaturedBlogs" : displayFeaturedBlogs == "yes",
    "featuredBlogsCount" : featuredBlogsCount,
    ${pageBuilderFragment},
    "slug": slug.current
  }
`);

export const queryBlogIndexPageBlogs = defineQuery(`
  *[_type == "blog" && (seoHideFromLists != true) && ($category == "" || category->slug.current == $category)] | order(orderRank asc) [$start...$end]{
    ${blogCardFragment}
  }
`);

export const queryAllBlogDataForSearch = defineQuery(`
  *[_type == "blog" && defined(slug.current) && (seoHideFromLists != true)]{
    ${blogCardFragment}
  }
`);

export const queryBlogIndexPageBlogsCount = defineQuery(`
  count(*[_type == "blog" && (seoHideFromLists != true) && ($category == "" || category->slug.current == $category)])
`);

export const queryBlogCategories = defineQuery(`
  *[_type == "category"] | order(orderRank asc){
    _id,
    title,
    "slug": slug.current
  }
`);
export const queryBlogSlugPageData = defineQuery(`
  *[_type == "blog" && slug.current == $slug][0]{
    ...,
    "slug": slug.current,
    "category": category->{ _id, title, "slug": slug.current },
    ${blogAuthorFragment},
    ${imageFragment},
    ${richTextFragment},
    ${pageBuilderFragment}
  }
`);

export const queryBlogPaths = defineQuery(`
  *[_type == "blog" && defined(slug.current)].slug.current
`);

const ogFieldsFragment = /* groq */ `
  _id,
  _type,
  "title": select(
    defined(ogTitle) => ogTitle,
    defined(seoTitle) => seoTitle,
    title
  ),
  "description": select(
    defined(ogDescription) => ogDescription,
    defined(seoDescription) => seoDescription,
    description
  ),
  "image": image.asset->url + "?w=1200&h=630&dpr=2&fit=crop",
  "dominantColor": image.asset->metadata.palette.dominant.background,
  "seoImage": seoImage.asset->url + "?w=1200&h=630&dpr=2&fit=max",
  "logo": *[_type == "settings"][0].logo.asset->url + "?w=80&h=40&dpr=3&fit=max&q=100",
  "siteTitle": *[_type == "settings"][0].siteTitle,
  "date": coalesce(date, _createdAt)
` as const;

export const queryHomePageOGData = defineQuery(`
  *[_type == "homePage" && _id == $id][0]{
    ${ogFieldsFragment}
  }
  `);

export const querySlugPageOGData = defineQuery(`
  *[_type == "page" && _id == $id][0]{
    ${ogFieldsFragment}
  }
`);

export const queryBlogPageOGData = defineQuery(`
  *[_type == "blog" && _id == $id][0]{
    ${ogFieldsFragment}
  }
`);

export const queryGenericPageOGData = defineQuery(`
  *[ defined(slug.current) && _id == $id][0]{
    ${ogFieldsFragment}
  }
`);

// Products and categories have no Open Graph query: their cards read the live
// catalog. A snapshot here would be a second copy of the price, stale by
// however long it has been since the last reconcile sweep, on the one surface
// where a wrong figure is cached by other people's servers.

export const queryPromoBannerData = defineQuery(`
  *[_type == "promoBanner" && _id == "promoBanner"][0]{
    _id,
    enabled,
    text,
    "openInNewTab": link.openInNewTab,
    ${hrefFragment("link.", "link.href")},
  }
`);

export const queryFooterData = defineQuery(`
  *[_type == "footer" && _id == "footer"][0]{
    _id,
    subtitle,
    backgroundImage {
      ${imageFields}
    },
    columns[]{
      _key,
      title,
      links[]{
        _key,
        name,
        "openInNewTab": url.openInNewTab,
        ${hrefFragment("url.", "url.href")},
      }
    }
  }
`);

export const queryNavbarData = defineQuery(`
  *[_type == "navbar" && _id == "navbar"][0]{
    _id,
    columns[]{
      _key,
      _type == "navbarColumn" => {
        "type": "column",
        title,
        links[]{
          _key,
          name,
          icon,
          description,
          "openInNewTab": url.openInNewTab,
          ${hrefFragment("url.", "url.href")}
        }
      },
      _type == "navbarLink" => {
        "type": "link",
        name,
        description,
        "openInNewTab": url.openInNewTab,
        ${hrefFragment("url.", "url.href")}
      },
      _type == "collectionGroup" => {
        "type": "collectionGroup",
        title,
        // Both fields are weak references to a synced category and both render
        // as /collections/{slug}, so both carry the explorer's clauses — the
        // dropdown is one more surface that can link a category BigCommerce
        // will not serve.
        //
        // array::compact for the dangling half: CollectionGroupDropdown maps
        // collectionLinks and reads .slug off each entry, so a null from a
        // reference whose target the sync has not written yet is a TypeError,
        // not a missing row. featuredProductsBlock and the explorer compact the
        // identical shape.
        "collectionLinks": array::compact(collectionLinks[@->store.isDeleted != true && @->store.isVisible == true]->{
          _id,
          "slug": coalesce(store.path, store.slug.current),
          store{
            title,
            imageUrl
          }
        }),
        // A single reference cannot take a filter, so the same two clauses go
        // in a select. No default: the dropdown already treats a missing
        // collectionProducts as "no View all link" rather than a dense field.
        "collectionProducts": select(
          collectionProducts->store.isDeleted != true && collectionProducts->store.isVisible == true => collectionProducts->{
            _id,
            "slug": coalesce(store.path, store.slug.current),
            store{
              title
            }
          }
        )
      }
    },
    ${buttonsFragment},
  }
`);

// Each key is a document `_type`, which `SANITY_SITEMAP_SOURCES` in
// apps/web/src/app/sitemap.ts is typed against — adding a source there without
// a matching projection here is a typecheck failure rather than a page that is
// silently missing from the sitemap.
export const querySitemapData = defineQuery(`{
  "page": *[_type == "page" && defined(slug.current)]{
    "path": slug.current,
    "lastModified": _updatedAt
  },
  "blog": *[_type == "blog" && defined(slug.current)]{
    "path": slug.current,
    "lastModified": _updatedAt
  }
}`);
export const queryGlobalSeoSettings = defineQuery(`
  *[_type == "settings"][0]{
    _id,
    _type,
    siteTitle,
    logo {
      ${imageFields}
    },
    siteDescription,
    socialLinks{
      linkedin,
      facebook,
      twitter,
      instagram,
      youtube
    }
  }
`);

export const querySettingsData = defineQuery(`
  *[_type == "settings"][0]{
    _id,
    _type,
    siteTitle,
    siteDescription,
    "logo": logo.asset->url + "?w=80&h=40&dpr=3&fit=max",
    "socialLinks": socialLinks,
    "contactEmail": contactEmail,
  }
`);

export const queryRedirects = defineQuery(`
  *[_type == "redirect" && status == "active" && defined(source.current) && defined(destination.current)]{
    "source":source.current,
    "destination":destination.current,
    "permanent" : permanent == "true"
  }
`);

export const queryRedirectBySource = defineQuery(`
  *[_type == "redirect" && status == "active" && source.current == $source && defined(destination.current)][0]{
    "source":source.current,
    "destination":destination.current,
    "permanent" : permanent == "true"
  }
`);

// ── Product queries ──
//
// There are none. The PDP renders from live BigCommerce, and nothing else
// reads a product out of Sanity: `queryProductByHandle` and its editorial
// `body` fragment went with the synced document's editorial fields, and
// `queryProductPaths` went to `getProductPaths` — one enumeration behind
// `generateStaticParams`, the sitemap and llms.txt instead of two that can
// disagree.

// ── Category queries ──
//
// `queryCollectionByHandle` and its `modules` fragment are gone: they read the
// fork's collection document's editorial `hero` and `modules` arrays, and
// the category page has rendered from live BigCommerce since the flip. The
// synced category document holds no such fields, and its only consumer was a
// component with no importers.

export const queryCollectionsIndexPageData = defineQuery(`
  *[_type == "collectionsIndex"][0]{
    ...,
    _id,
    _type,
    title,
    subtitle,
    heroTitle,
    heroImage {
      ${imageFields}
    },
    ${buttonsFragment},
    "slug": slug.current
  }
`);
