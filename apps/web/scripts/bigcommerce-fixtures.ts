/**
 * Captures BigCommerce Storefront API responses verbatim into
 * `src/lib/bigcommerce/__fixtures__/`.
 *
 *   pnpm --filter web exec tsx --conditions react-server \
 *     --env-file-if-exists=.env.local scripts/bigcommerce-fixtures.ts [name…]
 *
 * Pass fixture names to recapture a subset; pass none to recapture everything.
 *
 * Why this exists (ROB-2531): the adapters in ROB-2533/2534/2535/2536 are
 * written *against* these payloads, not the other way round. Writing the
 * adapter first and then a fixture that matches it produces a green suite that
 * proves nothing, and it is exactly how the old backend's semantics survive
 * under BigCommerce names.
 *
 * Three things about the shape:
 *
 * - **Raw fetch, not `storefrontQuery`.** The client folds `errors[]` into one
 *   joined string and drops `path`/`locations`/`extensions`. An error-taxonomy
 *   fixture built from that has already thrown the taxonomy away. Headers and
 *   endpoint still come from the client module, so there is one definition of
 *   where the request goes.
 * - **The query travels inside the fixture.** `{ query, variables, status,
 *   response }` in one file, rather than a sidecar `.graphql` or a central
 *   manifest, because a sidecar is a second file to keep in sync and a
 *   manifest puts the answer to "what produced this?" somewhere other than the
 *   thing being asked about.
 * - **`response` is the HTTP body byte-for-byte**, re-serialised only by
 *   `JSON.stringify`. Nothing is trimmed to fit an expected shape.
 *
 * The documents below are `graphql()` documents, so `gql.tada check` validates
 * every capture query against the committed schema — a schema refresh that
 * breaks a capture fails `pnpm check-types` rather than at capture time.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { env } from "@workspace/env/server";
import { type DocumentNode, print } from "graphql";

import { storefrontUrl } from "../src/lib/bigcommerce/client";
import { graphql } from "../src/lib/bigcommerce/graphql";

const OUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/lib/bigcommerce/__fixtures__"
);

// Seeded sandbox ids. `pnpm seed:bigcommerce` keys on URL path and SKU, not on
// these, so a reseed can renumber them — recapture rather than trusting them.
const RYE = 189; // sale price, colour swatch, turbo_start metafields
const ASTER = 183; // 2 colourways x 5 sizes = 10 variants
const WREN = 191; // one variant, one option value
const WREN_VARIANT = 235; // TS-P5-WAS-ONESIZE
const JACKETS = 36;

/**
 * Throwaway digital product, created for the digital-cart fixtures and deleted
 * afterwards — the seeded catalog is entirely physical. Recreate before
 * recapturing those:
 *
 *   POST /v3/catalog/products
 *     {"name":"Turbo Start Care Guide (Digital)","type":"digital",
 *      "sku":"TS-FIXTURE-DIGITAL","price":12,"weight":0,"is_visible":true,
 *      "availability":"available","inventory_tracking":"none"}
 *   PUT /v3/catalog/products/channel-assignments
 *     [{"product_id":<new>,"channel_id":1}]
 *
 * The channel assignment is not optional. A new BigCommerce product belongs to
 * no channel, so the Admin API returns it and the Storefront API cannot see it.
 */
const DIGITAL = 193;

type Capture = {
  name: string;
  /** A string only where the query is deliberately invalid. */
  document: DocumentNode | string;
  variables?: Record<string, unknown>;
  /** Recorded in the fixture where the payload misleads without it. */
  note?: string;
  /** Suppresses the "unexpected errors, not written" guard. */
  expectErrors?: boolean;
};

async function run(
  document: DocumentNode | string,
  variables?: Record<string, unknown>
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(storefrontUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.BIGCOMMERCE_STOREFRONT_TOKEN}`,
      "User-Agent": "turbo-start-bigcommerce",
    },
    body: JSON.stringify({
      query: typeof document === "string" ? document : print(document),
      variables,
    }),
  });

  const text = await response.text();

  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    // BigCommerce serves an HTML page for gateway errors and rate limiting.
    // Surfacing it as a capture failure beats crashing mid-run and leaving the
    // cart sequence half-finished.
    throw new Error(
      `Storefront API returned ${response.status} with a non-JSON body: ${text.slice(0, 200)}`
    );
  }
}

/**
 * Runs the capture and writes it, unless the response looks like a mistake or
 * the caller only wanted it run. Overwriting a good fixture with a null root is
 * the one way a routine recapture can silently destroy the thing this ticket
 * exists to protect, so it refuses instead. Returns the body either way, since
 * the cart sequence reads its next id out of the response it just captured.
 */
async function capture(
  spec: Capture,
  write = true
): Promise<{ ok: boolean; body: unknown }> {
  const { status, body } = await run(spec.document, spec.variables);

  if (!write) {
    return { ok: true, body };
  }

  const payload = body as { data?: unknown; errors?: unknown[] };
  const hasErrors = (payload.errors?.length ?? 0) > 0;

  if (hasErrors !== Boolean(spec.expectErrors)) {
    const why = hasErrors ? "unexpected errors" : "expected errors, got none";
    console.error(`  ${spec.name}: ${why} — not written`);
    console.error(`    ${JSON.stringify(payload.errors ?? null).slice(0, 300)}`);
    return { ok: false, body };
  }

  if (!(spec.expectErrors || payload.data)) {
    console.error(`  ${spec.name}: no data — not written`);
    return { ok: false, body };
  }

  const query =
    typeof spec.document === "string" ? spec.document : print(spec.document);

  const fixture = {
    query,
    variables: spec.variables ?? null,
    status,
    ...(spec.note === undefined ? {} : { note: spec.note }),
    response: body,
  };

  await writeFile(
    join(OUT_DIR, `${spec.name}.json`),
    `${JSON.stringify(fixture, null, 2)}\n`
  );

  console.log(`  ${spec.name}`);
  return { ok: true, body };
}

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

/**
 * The full product read. Deliberately wider than any one adapter needs:
 * recapturing costs a live store, so a field nobody wants yet is cheaper here
 * than a recapture later.
 */
const ProductDetail = graphql(`
  fragment ProductDetail on Product {
    entityId
    sku
    path
    name
    description
    plainTextDescription(characterLimit: 200)
    type
    condition
    availabilityV2 {
      __typename
      status
      description
    }
    inventory {
      isInStock
      isStockTracked
      hasVariantInventory
      aggregated {
        availableToSell
        warningLevel
      }
    }
    prices {
      price {
        value
        currencyCode
      }
      basePrice {
        value
        currencyCode
      }
      salePrice {
        value
        currencyCode
      }
      retailPrice {
        value
        currencyCode
      }
      saved {
        value
        currencyCode
      }
      priceRange {
        min {
          value
          currencyCode
        }
        max {
          value
          currencyCode
        }
      }
    }
    brand {
      entityId
      name
      path
    }
    categories(first: 10) {
      edges {
        node {
          entityId
          name
          path
        }
      }
    }
    defaultImage {
      url(width: 640)
      urlOriginal
      altText
      isDefault
    }
    images(first: 20) {
      edges {
        node {
          url(width: 640)
          altText
          isDefault
        }
      }
    }
    productOptions(first: 10) {
      edges {
        node {
          __typename
          entityId
          displayName
          isRequired
          isVariantOption
          ... on MultipleChoiceOption {
            displayStyle
            values(first: 25) {
              edges {
                node {
                  __typename
                  entityId
                  label
                  isDefault
                  ... on SwatchOptionValue {
                    hexColors
                  }
                }
              }
            }
          }
        }
      }
    }
    metafields(namespace: "turbo_start", first: 25) {
      edges {
        node {
          entityId
          key
          value
        }
      }
    }
    seo {
      pageTitle
      metaDescription
      metaKeywords
    }
  }
`);

/** Variant read, split out because two fixtures want different slices of it. */
const VariantDetail = graphql(`
  fragment VariantDetail on Variant {
    entityId
    sku
    isPurchasable
    upc
    mpn
    gtin
    prices {
      price {
        value
        currencyCode
      }
      basePrice {
        value
        currencyCode
      }
      salePrice {
        value
        currencyCode
      }
      retailPrice {
        value
        currencyCode
      }
    }
    inventory {
      isInStock
      aggregated {
        availableToSell
        warningLevel
      }
    }
    options(first: 10) {
      edges {
        node {
          entityId
          displayName
          values(first: 10) {
            edges {
              node {
                entityId
                label
              }
            }
          }
        }
      }
    }
  }
`);

const ProductByPath = graphql(
  `
    query ProductByPath($path: String!) {
      site {
        route(path: $path) {
          redirect {
            toUrl
          }
          node {
            __typename
            ...ProductDetail
            ... on Product {
              variants(first: 25) {
                edges {
                  node {
                    ...VariantDetail
                  }
                }
              }
            }
          }
        }
      }
    }
  `,
  [ProductDetail, VariantDetail]
);

const ProductById = graphql(
  `
    query ProductById($entityId: Int!) {
      site {
        product(entityId: $entityId) {
          __typename
          ...ProductDetail
          variants(first: 25) {
            edges {
              node {
                ...VariantDetail
              }
            }
          }
        }
      }
    }
  `,
  [ProductDetail, VariantDetail]
);

const ProductVariantsAndOptions = graphql(
  `
    query ProductVariantsAndOptions($entityId: Int!) {
      site {
        product(entityId: $entityId) {
          entityId
          name
          path
          productOptions(first: 10) {
            edges {
              node {
                __typename
                entityId
                displayName
                isRequired
                isVariantOption
                ... on MultipleChoiceOption {
                  displayStyle
                  values(first: 25) {
                    edges {
                      node {
                        __typename
                        entityId
                        label
                        isDefault
                        ... on SwatchOptionValue {
                          hexColors
                        }
                      }
                    }
                  }
                }
              }
            }
          }
          variants(first: 50) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                ...VariantDetail
              }
            }
          }
        }
      }
    }
  `,
  [VariantDetail]
);

/**
 * Two products in one response on purpose. BigCommerce serves a variant's
 * `defaultImage` out of `attribute_rule_images/`, a namespace the product's own
 * `images` connection never contains — so "match the variant image against the
 * product image list", which is how the fork base does it, matches nothing
 * here. Aster shows it across two colourways; Wren shows the same thing
 * on a single-variant product, which is what kills the tempting rule that the
 * override only happens when there is more than one colourway.
 */
const VariantImages = graphql(`
  query VariantImages($multiColour: Int!, $singleVariant: Int!) {
    site {
      multiColour: product(entityId: $multiColour) {
        entityId
        name
        defaultImage {
          url(width: 640)
          urlOriginal
          altText
          isDefault
        }
        images(first: 25) {
          edges {
            node {
              url(width: 640)
              urlOriginal
              altText
              isDefault
            }
          }
        }
        variants(first: 50) {
          edges {
            node {
              entityId
              sku
              defaultImage {
                url(width: 640)
                urlOriginal
                altText
                isDefault
              }
              options(first: 10) {
                edges {
                  node {
                    displayName
                    values(first: 10) {
                      edges {
                        node {
                          label
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      singleVariant: product(entityId: $singleVariant) {
        entityId
        name
        defaultImage {
          url(width: 640)
          urlOriginal
          altText
          isDefault
        }
        images(first: 25) {
          edges {
            node {
              url(width: 640)
              urlOriginal
              altText
              isDefault
            }
          }
        }
        variants(first: 10) {
          edges {
            node {
              entityId
              sku
              defaultImage {
                url(width: 640)
                urlOriginal
                altText
                isDefault
              }
            }
          }
        }
      }
    }
  }
`);

// ---------------------------------------------------------------------------
// Category
// ---------------------------------------------------------------------------

const CategoryByPath = graphql(`
  query CategoryByPath($path: String!) {
    site {
      route(path: $path) {
        redirect {
          toUrl
        }
        node {
          __typename
          ... on Category {
            entityId
            name
            path
            description
            defaultImage {
              url(width: 640)
              altText
            }
            breadcrumbs(depth: 5) {
              edges {
                node {
                  entityId
                  name
                  path
                }
              }
            }
            seo {
              pageTitle
              metaDescription
              metaKeywords
            }
            products(first: 10) {
              collectionInfo {
                totalItems
              }
              pageInfo {
                hasNextPage
                endCursor
              }
              edges {
                node {
                  entityId
                  name
                  path
                  defaultImage {
                    url(width: 320)
                    altText
                  }
                  prices {
                    price {
                      value
                      currencyCode
                    }
                    basePrice {
                      value
                      currencyCode
                    }
                    salePrice {
                      value
                      currencyCode
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`);

const CategoryTree = graphql(`
  query CategoryTree {
    site {
      categoryTree {
        entityId
        name
        path
        description
        productCount
        hasChildren
        image {
          url(width: 320)
          altText
        }
        children {
          entityId
          name
          path
          productCount
          hasChildren
          children {
            entityId
            name
            path
            productCount
            hasChildren
          }
        }
      }
    }
  }
`);

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

const SearchProducts = graphql(`
  query SearchProducts($filters: SearchProductsFiltersInput!) {
    site {
      search {
        searchProducts(filters: $filters) {
          products(first: 10) {
            collectionInfo {
              totalItems
            }
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                entityId
                name
                path
                brand {
                  entityId
                  name
                }
                defaultImage {
                  url(width: 320)
                  altText
                }
                prices {
                  price {
                    value
                    currencyCode
                  }
                  basePrice {
                    value
                    currencyCode
                  }
                  salePrice {
                    value
                    currencyCode
                  }
                }
              }
            }
          }
          filters(first: 25) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                __typename
                displayName
                isCollapsedByDefault
                ... on BrandSearchFilter {
                  displayProductCount
                  brands(first: 50) {
                    edges {
                      node {
                        entityId
                        name
                        isSelected
                        productCount
                      }
                    }
                  }
                }
                ... on CategorySearchFilter {
                  displayProductCount
                  categories(first: 50) {
                    edges {
                      node {
                        entityId
                        name
                        isSelected
                        productCount
                      }
                    }
                  }
                }
                ... on ProductAttributeSearchFilter {
                  filterKey
                  displayProductCount
                  attributes(first: 50) {
                    edges {
                      node {
                        value
                        isSelected
                        productCount
                      }
                    }
                  }
                }
                ... on RatingSearchFilter {
                  ratings(first: 10) {
                    edges {
                      node {
                        value
                        isSelected
                        productCount
                      }
                    }
                  }
                }
                ... on PriceSearchFilter {
                  selected {
                    minPrice
                    maxPrice
                  }
                }
              }
            }
          }
          suggestions {
            sourceField
            results {
              text
            }
          }
        }
      }
    }
  }
`);

// ---------------------------------------------------------------------------
// Metafields
// ---------------------------------------------------------------------------

const Metafields = graphql(`
  query Metafields($entityId: Int!, $namespace: String!) {
    site {
      product(entityId: $entityId) {
        entityId
        name
        metafields(namespace: $namespace, first: 25) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              entityId
              key
              value
              description
            }
          }
        }
        variants(first: 3) {
          edges {
            node {
              entityId
              sku
              metafields(namespace: $namespace, first: 25) {
                edges {
                  node {
                    entityId
                    key
                    value
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`);

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

const CartDetail = graphql(`
  fragment CartDetail on Cart {
    entityId
    currencyCode
    isTaxIncluded
    baseAmount {
      value
      currencyCode
    }
    discountedAmount {
      value
      currencyCode
    }
    amount {
      value
      currencyCode
    }
    discounts {
      entityId
      discountedAmount {
        value
        currencyCode
      }
    }
    createdAt {
      utc
    }
    updatedAt {
      utc
    }
    locale
    version
    lineItems {
      totalQuantity
      physicalItems {
        entityId
        parentEntityId
        productEntityId
        variantEntityId
        sku
        name
        path
        brand
        quantity
        isTaxable
        isMutable
        isShippingRequired
        image {
          url(width: 320)
          altText
        }
        selectedOptions {
          __typename
          entityId
          name
          ... on CartSelectedMultipleChoiceOption {
            value
            valueEntityId
          }
        }
        listPrice {
          value
          currencyCode
        }
        originalPrice {
          value
          currencyCode
        }
        salePrice {
          value
          currencyCode
        }
        extendedListPrice {
          value
          currencyCode
        }
        extendedSalePrice {
          value
          currencyCode
        }
        discountedAmount {
          value
          currencyCode
        }
        couponAmount {
          value
          currencyCode
        }
        discounts {
          entityId
          discountedAmount {
            value
            currencyCode
          }
        }
      }
      digitalItems {
        entityId
        parentEntityId
        productEntityId
        variantEntityId
        sku
        name
        path
        brand
        quantity
        isTaxable
        isMutable
        image {
          url(width: 320)
          altText
        }
        selectedOptions {
          __typename
          entityId
          name
        }
        listPrice {
          value
          currencyCode
        }
        originalPrice {
          value
          currencyCode
        }
        salePrice {
          value
          currencyCode
        }
        extendedListPrice {
          value
          currencyCode
        }
        extendedSalePrice {
          value
          currencyCode
        }
        discountedAmount {
          value
          currencyCode
        }
        couponAmount {
          value
          currencyCode
        }
      }
      giftCertificates {
        entityId
        name
        amount {
          value
          currencyCode
        }
      }
      customItems {
        entityId
        sku
        name
        quantity
        listPrice {
          value
          currencyCode
        }
      }
    }
  }
`);

const CreateCart = graphql(
  `
    mutation CreateCart($input: CreateCartInput!) {
      cart {
        createCart(input: $input) {
          cart {
            ...CartDetail
          }
        }
      }
    }
  `,
  [CartDetail]
);

const AddCartLineItems = graphql(
  `
    mutation AddCartLineItems($input: AddCartLineItemsInput!) {
      cart {
        addCartLineItems(input: $input) {
          cart {
            ...CartDetail
          }
        }
      }
    }
  `,
  [CartDetail]
);

const GetCart = graphql(
  `
    query GetCart($entityId: String!) {
      site {
        cart(entityId: $entityId) {
          ...CartDetail
        }
      }
    }
  `,
  [CartDetail]
);

const DeleteCart = graphql(`
  mutation DeleteCart($input: DeleteCartInput!) {
    cart {
      deleteCart(input: $input) {
        deletedCartEntityId
      }
    }
  }
`);

const Login = graphql(`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      customer {
        entityId
        email
      }
    }
  }
`);

// ---------------------------------------------------------------------------
// The captures
// ---------------------------------------------------------------------------

// Every seeded product carries at least one required option, so a cart line
// has to name a variant. The digital product is optionless and does not.
const PHYSICAL_LINE = {
  productEntityId: WREN,
  variantEntityId: WREN_VARIANT,
  quantity: 2,
};
const DIGITAL_LINE = { productEntityId: DIGITAL, quantity: 1 };

const captures: Capture[] = [
  {
    name: "product-by-path",
    document: ProductByPath,
    variables: { path: "/products/rye-leather-moto-jacket/" },
    note: "Also the sale / compare-at, colour-swatch and metafield payload: prices.basePrice 495 is the was-price, prices.salePrice 396 the now-price, the Color option is a SwatchOptionValue with hexColors, and metafields carries the turbo_start namespace. Envelope is site.route.node with a __typename discriminator, which is not the shape site.product returns — compare against product-by-id.json.",
  },
  {
    name: "product-by-id",
    document: ProductById,
    variables: { entityId: RYE },
    note: "Same product and same field set as product-by-path.json. The only difference is the envelope: site.product returns the Product directly with no route/redirect wrapper.",
  },
  {
    name: "product-variants-and-options",
    document: ProductVariantsAndOptions,
    variables: { entityId: ASTER },
    note: "Two variant options (Size x Color) crossed into 10 variants. Every variant.inventory.aggregated is null, so availableToSell and warningLevel read undefined — that is this store's 'show stock level' setting, not missing data, and isInStock is still authoritative.",
  },
  {
    name: "product-variant-image-override",
    document: VariantImages,
    variables: { multiColour: ASTER, singleVariant: WREN },
    note: "Every variant.defaultImage.url points at attribute_rule_images/, a namespace that appears nowhere in the product's own images connection, and carries altText: \"\". The fork base finds a variant's image by matching it against the product image list; that match can never succeed here. singleVariant (Wren, one variant, one option value) shows the same override, so 'only multi-colourway products override' is also wrong.",
  },
  {
    name: "category-top-level",
    document: CategoryByPath,
    variables: { path: "/collections/jackets/" },
    note: "Single-segment category path. breadcrumbs has one entry — the category itself — so there is no separate 'root' node to skip.",
  },
  {
    name: "category-nested",
    document: CategoryByPath,
    variables: { path: "/collections/tops/henleys/" },
    note: "Multi-segment path. Henleys is a real child of Tops in the seeded catalog, so pnpm seed:bigcommerce alone is enough to recapture this — no throwaway category to recreate first. breadcrumbs carries both segments, which is the difference from category-top-level.json.",
  },
  {
    name: "category-tree",
    document: CategoryTree,
    note: "The whole tree. Tops carries hasChildren: true and a populated children array because the seed writes Henleys underneath it — that nesting is what keeps this fixture's child coverage alive across a recapture.",
  },
  {
    name: "search-filters-unavailable",
    document: SearchProducts,
    variables: { filters: { searchTerm: "jacket" } },
    note: "The plan-gated faceted-search case, verbatim. Products load normally and filters.edges is [] with hasNextPage: false, endCursor: null, HTTP 200 and no errors array. This store is a Partner Sandbox, where product filtering is not on the plan. An empty filter list therefore means 'filtering unavailable', never 'no filters matched' — nothing in the payload distinguishes the two, which is why the storefront must render an explicit unavailable state rather than an empty sidebar.",
  },
  {
    name: "search-by-category",
    document: SearchProducts,
    variables: { filters: { categoryEntityId: JACKETS } },
    note: "The category PLP read — same searchProducts field the search page uses, scoped by categoryEntityId. filters.edges is empty here for the same plan-gating reason as search-filters-unavailable.json; this is the payload the category filter sidebar would be built from.",
  },
  {
    name: "metafields-turbo-start",
    document: Metafields,
    variables: { entityId: RYE, namespace: "turbo_start" },
    note: "The populated namespace. These exist on the storefront only because the seed sets permission_set: \"read_and_sf_access\" — a metafield written with plain \"read\" returns the same empty connection as metafields-unknown-namespace.json, with no error. Variant metafields are empty because the seed writes none.",
  },
  {
    name: "metafields-unknown-namespace",
    document: Metafields,
    variables: { entityId: RYE, namespace: "does_not_exist" },
    note: "An absent namespace returns edges: [] at HTTP 200 with no errors. Byte-for-byte the same shape as a metafield whose permission_set is wrong, so a reader cannot tell 'no metafields here' from 'metafields exist but are admin-only' — compare against metafields-turbo-start.json.",
  },
  {
    name: "error-product-not-found",
    document: CreateCart,
    variables: {
      input: { lineItems: [{ productEntityId: 999_999, quantity: 1 }] },
    },
    expectErrors: true,
    note: "The shape every runtime mutation error takes: HTTP 200, the mutation's own node nulled (data.cart.createCart), a populated errors array, and NO extensions object anywhere — so an error classifier has nothing machine-readable to switch on and must key on the message prefix (\"Not Found: \", \"Missing required fields.: \") plus path. Compare the four error-*.json cart payloads for the prefixes actually in use.",
  },
  {
    name: "error-missing-required-options",
    document: CreateCart,
    variables: { input: { lineItems: [{ productEntityId: RYE, quantity: 1 }] } },
    expectErrors: true,
    note: "Rye has Size and Color marked isRequired, so adding it by productEntityId alone fails. The storefront must send variantEntityId or selectedOptions. This message carries no prefix at all, unlike the Not Found and Missing required fields cases.",
  },
  {
    name: "error-invalid-quantity",
    document: CreateCart,
    // Variant supplied deliberately, so quantity is the only thing wrong with
    // this input — otherwise the payload could be the missing-variant error
    // wearing a different message and the note below would be unfalsifiable.
    variables: {
      input: { lineItems: [{ ...PHYSICAL_LINE, quantity: 0 }] },
    },
    expectErrors: true,
    note: "quantity: 0 is reported as `Missing required fields.: … missing required fields: \\`lineItems.*.quantity\\``, not as an invalid value. Anything mapping this to a validation-of-value branch on the message text will mis-file it.",
  },
  {
    name: "error-cart-not-found",
    document: AddCartLineItems,
    variables: {
      input: {
        cartEntityId: "00000000-0000-0000-0000-000000000000",
        data: { lineItems: [PHYSICAL_LINE] },
      },
    },
    expectErrors: true,
    note: "A well-formed cart id that does not exist. Same `Not Found: ` prefix as a missing product, distinguishable only by the rest of the message — which is why the taxonomy cannot be built from the prefix alone.",
  },
  {
    name: "error-login-invalid-credentials",
    document: Login,
    variables: {
      email: "nobody@example.invalid",
      password: "not-a-real-password",
    },
    expectErrors: true,
    note: "Note `data: null` — the whole data key is nulled, where the cart mutations null only their own node and leave data an object. A reader that assumes data is present whenever the status is 200 breaks here.",
  },
  {
    name: "error-query-validation",
    // Deliberately invalid, so it cannot be a `graphql()` document — gql.tada
    // would reject it at typecheck, which is the whole point of the others.
    document: "query Invalid { site { noSuchField } }",
    expectErrors: true,
    note: "The branch that never reaches a resolver. This is the only capture that is not HTTP 200: it is a 400, there is no data key at all rather than a null one, and the error carries locations but no path. Still no extensions.",
  },
];

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

/** Reads the cart id out of a create/add mutation response. */
function cartIdFrom(body: unknown): string {
  const found = JSON.stringify(body).match(/"entityId":"([0-9a-f-]{36})"/);

  if (!found?.[1]) {
    throw new Error(
      `No cart id in mutation response: ${JSON.stringify(body).slice(0, 400)}`
    );
  }

  return found[1];
}

/**
 * Creates real carts, captures them, and deletes them again. Sequenced rather
 * than declarative because every cart fixture needs an id BigCommerce only
 * hands back at runtime, and because the digital cart has to be read before it
 * grows a physical line and becomes the mixed one.
 *
 * The whole sequence runs even when only one cart fixture was asked for — a
 * cart id cannot be recovered any other way. Only the wanted ones are written,
 * and the sequence is skipped entirely when no cart fixture was asked for, so a
 * product-only recapture never leaves a real cart behind in the store.
 */
const CART_FIXTURES = [
  "cart-create-mutation",
  "cart-physical",
  "cart-digital",
  "cart-mixed",
];

async function captureCarts(
  wanted: (name: string) => boolean
): Promise<number> {
  if (!CART_FIXTURES.some(wanted)) {
    return 0;
  }

  let failed = 0;
  const record = async (spec: Capture) => {
    const result = await capture(spec, wanted(spec.name));
    if (!result.ok) {
      failed += 1;
    }
    return result.body;
  };

  const physicalCart = cartIdFrom(
    await record({
      name: "cart-create-mutation",
      document: CreateCart,
      variables: { input: { lineItems: [PHYSICAL_LINE] } },
      note: "The add-to-cart write path. Envelope is data.cart.createCart.cart, which is not the data.site.cart the read path returns — compare against cart-physical.json.",
    })
  );

  await record({
    name: "cart-physical",
    document: GetCart,
    variables: { entityId: physicalCart },
    note: "lineItems.physicalItems populated, digitalItems an empty array. BigCommerce splits a cart across those two lists and never merges them; the internal cart is one line list, so the adapter concatenates.",
  });

  const digitalCart = cartIdFrom(
    await run(CreateCart, { input: { lineItems: [DIGITAL_LINE] } }).then(
      (result) => result.body
    )
  );

  await record({
    name: "cart-digital",
    document: GetCart,
    variables: { entityId: digitalCart },
    note: "Mirror image: digitalItems populated, physicalItems empty. Digital items carry no isShippingRequired field at all, so a physical-shaped reader does not read false — it reads undefined. This is the same cart as cart-mixed.json, read before the physical line was added; the identical entityId in both files is not a mistake.",
  });

  // The mixed cart is the digital one grown a physical line, rather than one
  // created with both at once, because that is the order a shopper produces it.
  await run(AddCartLineItems, {
    input: { cartEntityId: digitalCart, data: { lineItems: [PHYSICAL_LINE] } },
  });

  await record({
    name: "cart-mixed",
    document: GetCart,
    variables: { entityId: digitalCart },
    note: "Both lists populated on one cart. lineItems.totalQuantity counts across both, so it is not derivable from either list alone.",
  });

  for (const cartEntityId of [physicalCart, digitalCart]) {
    await run(DeleteCart, { input: { cartEntityId } });
  }

  return failed;
}

async function main(): Promise<void> {
  const only = new Set(process.argv.slice(2));
  const wanted = (name: string) => only.size === 0 || only.has(name);

  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Capturing into ${OUT_DIR}`);

  let failed = 0;

  for (const spec of captures) {
    if (wanted(spec.name)) {
      const result = await capture(spec);
      failed += result.ok ? 0 : 1;
    }
  }

  failed += await captureCarts(wanted);

  if (failed > 0) {
    console.error(`${failed} capture(s) not written.`);
    process.exit(1);
  }
}

await main();
