/**
 * The seeded catalog, as pure data. No I/O.
 *
 * Everything here is deterministic — SKUs, category paths and image alt text
 * are the idempotency keys, so they are derived from indices rather than from
 * generated names. Faker only supplies display copy; if its output drifts
 * between versions the seed updates the existing rows instead of duplicating
 * them.
 */

import { faker } from "@faker-js/faker";

import type { CategoryDef, ProductDef, VariantDef } from "./types.js";

/**
 * 64 products: BigCommerce's REST list default is 50 per page, so this fills
 * page one and leaves a 14-item page two — enough for a pagination bug to
 * show up as a wrong count rather than an empty second page.
 */
const FILLER_COUNT = 60;

const IMAGE = (seed: string) =>
  `https://picsum.photos/seed/${seed}/900/1200.jpg`;

// ---------------------------------------------------------------------------
// Categories — parents first; `upsertCategories` relies on that ordering.
// ---------------------------------------------------------------------------

export const CATEGORIES: CategoryDef[] = [
  { path: "/shop/", name: "Shop", description: "Everything in the store." },
  {
    path: "/shop/mens/",
    name: "Mens",
    description: "Menswear.",
  },
  {
    path: "/shop/mens/jackets/",
    name: "Jackets",
    description: "Outerwear built for weather.",
  },
  {
    path: "/shop/mens/tees/",
    name: "Tees",
    description: "Everyday cotton basics.",
  },
  {
    path: "/shop/womens/",
    name: "Womens",
    description: "Womenswear.",
  },
  {
    path: "/shop/womens/dresses/",
    name: "Dresses",
    description: "Day and evening dresses.",
  },
  {
    path: "/shop/accessories/",
    name: "Accessories",
    description: "Bags, belts and small goods.",
  },
];

/** The deepest path, used by the catch-all route work in ticket 10. */
export const DEEP_CATEGORY_PATH = "/shop/mens/jackets/";

const LEAF_PATHS = [
  "/shop/mens/jackets/",
  "/shop/mens/tees/",
  "/shop/womens/dresses/",
  "/shop/accessories/",
];

// ---------------------------------------------------------------------------
// Hero products — the ones downstream tickets derive behaviour from
// ---------------------------------------------------------------------------

const abbrev = (label: string) =>
  label
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 3)
    .toUpperCase();

/**
 * Cartesian product of the option labels, one variant per combination.
 * `imageFor` returns undefined for variants that should fall back to the
 * product default — ticket 07 needs both states on the same product.
 */
function buildVariants(
  sku: string,
  labelSets: string[][],
  basePrice: number,
  salePrice: number | undefined,
  imageFor: (labels: string[]) => boolean
): VariantDef[] {
  const combos = labelSets.reduce<string[][]>(
    (acc, values) => acc.flatMap((c) => values.map((v) => [...c, v])),
    [[]]
  );

  return combos.map((labels) => {
    const variantSku = `${sku}-${labels.map(abbrev).join("-")}`;
    return {
      sku: variantSku,
      optionLabels: labels,
      price: basePrice,
      ...(salePrice === undefined ? {} : { salePrice }),
      ...(imageFor(labels) ? { imageUrl: IMAGE(variantSku) } : {}),
    };
  });
}

const JACKET_SKU = "TSB-JACKET-001";
const DRESS_SKU = "TSB-DRESS-001";

const HERO_PRODUCTS: ProductDef[] = [
  {
    // Swatch option x size option, sale price, and variants that are split
    // between having their own image and falling back to the product default.
    sku: JACKET_SKU,
    name: "Alpine Shell Jacket",
    description:
      "<p>A three-layer shell cut for hill weather. Taped seams, pit " +
      "zips, and a hood that fits over a helmet.</p>",
    price: 289,
    salePrice: 219,
    retailPrice: 329,
    weight: 620,
    categoryPath: "/shop/mens/jackets/",
    images: [
      { url: IMAGE(`${JACKET_SKU}-1`), alt: `${JACKET_SKU} image 1` },
      { url: IMAGE(`${JACKET_SKU}-2`), alt: `${JACKET_SKU} image 2` },
      { url: IMAGE(`${JACKET_SKU}-3`), alt: `${JACKET_SKU} image 3` },
    ],
    options: [
      {
        name: "Colour",
        type: "swatch",
        values: [
          { label: "Midnight", hex: "#101820" },
          { label: "Sand", hex: "#D6C7AE" },
          { label: "Moss", hex: "#4A5D3A" },
        ],
      },
      {
        name: "Size",
        type: "rectangles",
        values: [{ label: "S" }, { label: "M" }, { label: "L" }],
      },
    ],
    variants: buildVariants(
      JACKET_SKU,
      [
        ["Midnight", "Sand", "Moss"],
        ["S", "M", "L"],
      ],
      289,
      219,
      // Sand and Moss carry their own image; Midnight falls back.
      (labels) => labels[0] !== "Midnight"
    ),
    metafields: [
      {
        namespace: "turbo_start",
        key: "fabric",
        value: "3L recycled polyester, 20k/20k",
      },
      {
        namespace: "turbo_start",
        key: "care",
        value: "Machine wash cold, tumble dry low, do not iron",
      },
      { namespace: "specs", key: "weight_grams", value: "620" },
    ],
  },
  {
    // Non-swatch options only, no sale, no variant images — the plain case.
    sku: "TSB-TEE-001",
    name: "Everyday Cotton Tee",
    description:
      "<p>Heavyweight combed cotton, pre-shrunk, with a ribbed collar " +
      "that holds its shape.</p>",
    price: 38,
    weight: 210,
    categoryPath: "/shop/mens/tees/",
    images: [
      { url: IMAGE("TSB-TEE-001-1"), alt: "TSB-TEE-001 image 1" },
      { url: IMAGE("TSB-TEE-001-2"), alt: "TSB-TEE-001 image 2" },
    ],
    options: [
      {
        name: "Size",
        type: "rectangles",
        values: [
          { label: "S" },
          { label: "M" },
          { label: "L" },
          { label: "XL" },
        ],
      },
    ],
    variants: buildVariants(
      "TSB-TEE-001",
      [["S", "M", "L", "XL"]],
      38,
      undefined,
      () => false
    ),
    metafields: [
      { namespace: "turbo_start", key: "fabric", value: "100% organic cotton" },
    ],
  },
  {
    // Swatch option where every variant overrides the image.
    sku: DRESS_SKU,
    name: "Linen Wrap Dress",
    description:
      "<p>Washed European linen, cut on the bias, with a tie waist that " +
      "sits where you want it.</p>",
    price: 165,
    salePrice: 129,
    weight: 340,
    categoryPath: "/shop/womens/dresses/",
    images: [
      { url: IMAGE(`${DRESS_SKU}-1`), alt: `${DRESS_SKU} image 1` },
      { url: IMAGE(`${DRESS_SKU}-2`), alt: `${DRESS_SKU} image 2` },
    ],
    options: [
      {
        name: "Colour",
        type: "swatch",
        values: [
          { label: "Ecru", hex: "#F0EAD6" },
          { label: "Clay", hex: "#B66A50" },
          { label: "Ink", hex: "#1F2937" },
        ],
      },
    ],
    variants: buildVariants(
      DRESS_SKU,
      [["Ecru", "Clay", "Ink"]],
      165,
      129,
      () => true
    ),
    metafields: [
      { namespace: "turbo_start", key: "fabric", value: "100% washed linen" },
      { namespace: "specs", key: "origin", value: "Made in Portugal" },
    ],
  },
  {
    // No options at all — the single-variant path.
    sku: "TSB-TOTE-001",
    name: "Canvas Weekend Tote",
    description:
      "<p>18oz waxed canvas with a leather base and a strap long enough " +
      "to wear on the shoulder over a coat.</p>",
    price: 96,
    weight: 780,
    categoryPath: "/shop/accessories/",
    images: [
      { url: IMAGE("TSB-TOTE-001-1"), alt: "TSB-TOTE-001 image 1" },
      { url: IMAGE("TSB-TOTE-001-2"), alt: "TSB-TOTE-001 image 2" },
    ],
    options: [],
    variants: [],
    metafields: [
      { namespace: "turbo_start", key: "care", value: "Spot clean, re-wax" },
      { namespace: "specs", key: "capacity_litres", value: "32" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Filler products — bulk, to make pagination real
// ---------------------------------------------------------------------------

const SALE_EVERY = 4;

function buildFiller(): ProductDef[] {
  faker.seed(20_530);

  return Array.from({ length: FILLER_COUNT }, (_, i) => {
    const sku = `TSB-FILL-${String(i + 1).padStart(3, "0")}`;
    const name = `${faker.commerce.productAdjective()} ${faker.commerce.productMaterial()} ${faker.commerce.product()}`;
    const price = faker.number.int({ min: 18, max: 240 });
    const onSale = i % SALE_EVERY === 0;

    return {
      sku,
      name,
      description: `<p>${faker.commerce.productDescription()}</p>`,
      price,
      ...(onSale ? { salePrice: Math.round(price * 0.75) } : {}),
      weight: faker.number.int({ min: 100, max: 900 }),
      categoryPath: LEAF_PATHS[i % LEAF_PATHS.length] as string,
      images: [{ url: IMAGE(sku), alt: `${sku} image 1` }],
      options: [],
      variants: [],
      metafields: [],
    };
  });
}

export const PRODUCTS: ProductDef[] = [...HERO_PRODUCTS, ...buildFiller()];

/** Every seeded SKU starts with this, so seeded rows stay identifiable. */
export const SKU_PREFIX = "TSB-";

// ---------------------------------------------------------------------------
// Self-check — run first, before the seed touches the API
// ---------------------------------------------------------------------------

/**
 * Asserts the invariants the upsert logic assumes. Breaking one of these would
 * otherwise surface as a half-seeded store: some products written, then a
 * throw partway through. Checking costs nothing and fails first.
 */
export function validateCatalog(): void {
  const paths = new Set(CATEGORIES.map((c) => c.path));

  CATEGORIES.forEach((c, i) => {
    const segments = c.path.split("/").filter(Boolean);
    if (segments.length === 1) return;
    const parent = `/${segments.slice(0, -1).join("/")}/`;
    const parentIndex = CATEGORIES.findIndex((p) => p.path === parent);
    if (parentIndex === -1 || parentIndex > i) {
      throw new Error(
        `CATEGORIES: ${c.path} must be listed after its parent ${parent}`
      );
    }
  });

  const skus = new Set<string>();
  for (const p of [
    ...PRODUCTS,
    ...PRODUCTS.flatMap((p) => p.variants.map((v) => ({ sku: v.sku }))),
  ]) {
    if (skus.has(p.sku)) throw new Error(`Duplicate SKU: ${p.sku}`);
    skus.add(p.sku);
  }

  for (const p of PRODUCTS) {
    if (!paths.has(p.categoryPath)) {
      throw new Error(`${p.sku}: unknown category ${p.categoryPath}`);
    }
    for (const v of p.variants) {
      if (v.optionLabels.length !== p.options.length) {
        throw new Error(
          `${v.sku}: has ${v.optionLabels.length} labels for ` +
            `${p.options.length} options`
        );
      }
      v.optionLabels.forEach((label, i) => {
        if (!p.options[i]?.values.some((o) => o.label === label)) {
          throw new Error(`${v.sku}: "${label}" is not a value of option ${i}`);
        }
      });
    }
  }
}
