/** biome-ignore-all lint/performance/noImgElement: satori renders these, not a browser */
import { env } from "@workspace/env/client";
import { ImageResponse } from "next/og";
import type { ImageResponseOptions } from "next/server";
import type { CSSProperties, ReactNode } from "react";

import { getCategoryByPath, getProductById } from "@/lib/bigcommerce/catalog";
import { bigcommerceImageLoader } from "@/lib/bigcommerce/image-loader";
import {
  cardPricing,
  productToCardProps,
} from "@/lib/bigcommerce/product-card";
import type { Maybe } from "@/types";
import { getBaseUrl } from "@/utils";
import { getOgMetaData } from "./og-config";
import {
  getBlogPageOGData,
  getGenericPageOGData,
  getHomePageOGData,
  getSlugPageOGData,
  getStoreOGData,
} from "./og-data";

// Not edge: the catalog client is `server-only` and reads validated server env,
// neither of which the edge bundle carries. `ImageResponse` renders the same on
// Node, and the hour of caching is a response header rather than a runtime.

/**
 * What an unresolvable request renders. It used to be the words "Something
 * went Wrong with image generation", which `/collections` and `/search` shipped
 * as their social card. `lib/seo.ts` no longer sends a card-less route here;
 * this is the second line of defence.
 *
 * A function, not a constant: `OG_STATIC_IMAGE` is declared below, so a
 * constant would read it in its temporal dead zone.
 */
const fallbackContent = () => (
  <FullBleed image={OG_STATIC_IMAGE}>{null}</FullBleed>
);

type ContentProps = Record<string, string>;

type BrandedRenderProps = {
  image?: Maybe<string>;
  siteTitle?: Maybe<string>;
  /** Optional page title shown as a breadcrumb after the store name. */
  title?: Maybe<string>;
};

type ProductRenderProps = BrandedRenderProps & {
  title?: Maybe<string>;
  /** Preformatted, e.g. "£120.00". */
  price?: Maybe<string>;
  /** The compare-at price, struck through — only set on a real markdown. */
  strikePrice?: Maybe<string>;
  /** Preformatted markdown label, e.g. "-16%". */
  discount?: Maybe<string>;
  /** Swatch hexes in catalog order; a colour the merchant left unstyled is null. */
  swatches?: readonly (string | null)[];
};

// Normal pages (home / page / collection) all use this single static full-bleed
// image. Only products (and blogs) use a dynamic image.
const OG_STATIC_IMAGE = `${getBaseUrl()}/opengraph.png`;

// Only reached when BigCommerce omits a currency code on a price, which it
// does not do for a live catalog — the fallback keeps the card formatting
// rather than throwing inside `Intl`.
const OG_CURRENCY = env.NEXT_PUBLIC_STORE_CURRENCY;

/** The image width the card renders at, asked of the CDN rather than upscaled. */
const OG_IMAGE_WIDTH = 1200;

/** How many swatches fit beside the price before the bar starts crowding. */
const OG_SWATCH_LIMIT = 5;

const catalogImageUrl = (src: Maybe<string>): string | undefined =>
  src ? bigcommerceImageLoader({ src, width: OG_IMAGE_WIDTH }) : undefined;

// Floating bar: inset from the image edges (no radius, no shadow — the float
// comes from the inset margins).
const BAR_INSET = 24;
const BAR_HEIGHT = 42;
const BAR_BG = "#fafafa";
const TEXT_DARK = "#18181b";

// Matches the product card's `.card-surface` (--card-surface-from/to in
// packages/ui globals) — used behind transparent/missing product images. Those
// tokens are oklch(); the hex here is the equivalent and has to stay hex because
// satori (next/og) can't parse oklch() and would drop the gradient entirely.
const CARD_GRADIENT = "linear-gradient(to bottom, #c1c6c8, #e2e5e9)";

// Brand marks are rendered as inline-SVG data URIs via <img>. Satori reliably
// honors width/height on <img> for layout, whereas a nested <svg> is measured
// as zero-width and collapses (its neighbors then overlap it).
const svgDataUri = (svg: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

const VERCEL_MARK = svgDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 1L24 22H0L12 1Z" fill="#000000"/></svg>'
);

const ROBOTO_MARK = svgDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 11"><path d="M9.56742 7.832L11.6837 5.72V2.2L9.47924 0H4.40895L2.20447 2.2H9.47924V5.72H4.38911L3.08626 7.0202H2.20447V2.2L0 4.4V11H2.20447V7.48H6.39518L9.69968 11H12.3451L9.56742 7.832Z" fill="#000000"/><path d="M62.607 2.2H69H73.1885V0H62.607V2.2Z" fill="#000000"/><path d="M66.7955 11H69V2.2L66.7955 4.4V11Z" fill="#000000"/><path d="M18.0767 11H23.8083L26.0128 8.8H18.0767V11Z" fill="#000000"/><path d="M26.0128 0H20.2812L18.0767 2.2H26.0128V0Z" fill="#000000"/><path d="M15.8722 4.4V8.8H18.0767V2.2L15.8722 4.4Z" fill="#000000"/><path d="M26.0128 8.8L28.2173 6.6V2.2H26.0128V8.8Z" fill="#000000"/><path d="M50.262 11H55.9936L58.1981 8.8H50.262V11Z" fill="#000000"/><path d="M58.1981 0H52.4665L50.262 2.2H58.1981V0Z" fill="#000000"/><path d="M48.0575 4.4V8.8H50.262V2.2L48.0575 4.4Z" fill="#000000"/><path d="M58.1981 8.8L60.4026 6.6V2.2H58.1981V8.8Z" fill="#000000"/><path d="M77.5975 11H83.3291L85.5336 8.8H77.5975V11Z" fill="#000000"/><path d="M85.5336 0H79.8019L77.5975 2.2H85.5336V0Z" fill="#000000"/><path d="M75.393 4.4V8.8H77.5975V2.2L75.393 4.4Z" fill="#000000"/><path d="M85.5336 8.8L87.738 6.6V2.2H85.5336V8.8Z" fill="#000000"/><path d="M44.5304 4.18V2.2L42.3259 0H36.1534L33.9489 2.2H42.3259V4.62H36.1534L34.8307 5.94H33.9489V2.2L31.7444 4.4V8.8H33.9489V6.38H42.3259V8.8H33.9489V11H42.3259L44.5304 8.8V6.6H42.7668V5.94L44.5304 4.18Z" fill="#000000"/></svg>'
);

const CreditMark = ({ src }: { src: string }) => (
  <img alt="" height={15} src={src} style={{ flexShrink: 0 }} width={16} />
);

const CreditGroup = ({ children }: { children: ReactNode }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
    {children}
  </div>
);

const CreditDivider = () => (
  <div
    style={{
      width: 1,
      height: 16,
      backgroundColor: "#e4e4e7",
      flexShrink: 0,
    }}
  />
);

/**
 * Sanity art arrives pre-cropped to this card's aspect (`fit=crop` honours the
 * hotspot), so it covers cleanly. BigCommerce catalog art is the raw 1200x1607
 * portrait, and covering 0.75:1 into a 1.9:1 card keeps 39% of the height —
 * every anchor either beheads the model or loses the garment. Letterboxed onto
 * the card gradient instead.
 */
const objectFitFor = (image?: Maybe<string>) =>
  image?.includes("cdn11.bigcommerce.com") ? "contain" : "cover";

const FullBleed = ({
  image,
  children,
}: {
  image?: Maybe<string>;
  children: ReactNode;
}) => (
  // The card gradient sits behind the image — visible whenever the image is
  // transparent (products/collections) or fails to load. Opaque images cover it.
  <div
    style={{
      display: "flex",
      position: "relative",
      width: "100%",
      height: "100%",
      fontFamily: "Inter",
      backgroundColor: "#f4f4f5",
      backgroundImage: CARD_GRADIENT,
    }}
  >
    {image ? (
      <img
        alt=""
        height={630}
        src={image}
        style={{
          width: "100%",
          height: "100%",
          objectFit: objectFitFor(image),
        }}
        width={1200}
      />
    ) : null}
    {children}
  </div>
);

const barStyle: CSSProperties = {
  position: "absolute",
  left: BAR_INSET,
  right: BAR_INSET,
  bottom: BAR_INSET,
  height: BAR_HEIGHT,
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  backgroundColor: BAR_BG,
  padding: "0 16px",
};

const StoreName = ({ siteTitle }: { siteTitle?: Maybe<string> }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      fontSize: 16,
      fontWeight: 500,
      letterSpacing: "1.68px",
      color: "#09090b",
      flexShrink: 0,
    }}
  >
    {(siteTitle ?? "Turbo Store").toUpperCase()}
  </div>
);

const truncate = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;

const StoreBreadcrumb = ({
  siteTitle,
  title,
}: {
  siteTitle?: Maybe<string>;
  title?: Maybe<string>;
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      flexShrink: 1,
      minWidth: 0,
    }}
  >
    <StoreName siteTitle={siteTitle} />
    {title ? (
      <span style={{ display: "flex", fontSize: 16, color: "#a1a1aa" }}>/</span>
    ) : null}
    {title ? (
      <span
        style={{
          fontSize: 16,
          fontWeight: 500,
          color: TEXT_DARK,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: 520,
        }}
      >
        {truncate(title, 42)}
      </span>
    ) : null}
  </div>
);

const brandedPageRender = ({ image, siteTitle, title }: BrandedRenderProps) => (
  <FullBleed image={image}>
    <div style={barStyle}>
      <StoreBreadcrumb siteTitle={siteTitle} title={title} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontSize: 15,
          color: TEXT_DARK,
          flexShrink: 0,
        }}
      >
        <CreditGroup>
          <span>Built by</span>
          <img
            alt="Roboto"
            height={12}
            src={ROBOTO_MARK}
            style={{ flexShrink: 0 }}
            width={96}
          />
        </CreditGroup>
        <CreditDivider />
        <CreditGroup>
          <span>Hosted on</span>
          <CreditMark src={VERCEL_MARK} />
          <span style={{ fontWeight: 500 }}>Vercel</span>
        </CreditGroup>
        <CreditDivider />
        <CreditGroup>
          <span>Powered by</span>
          <span style={{ fontWeight: 500 }}>BigCommerce</span>
        </CreditGroup>
      </div>
    </div>
  </FullBleed>
);

// Sale markdown label — grey zinc/200 chip.
const DiscountBadge = ({ label }: { label: string }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: 26,
      padding: "0 4px",
      backgroundColor: "#e4e4e7",
      fontSize: 12,
      fontWeight: 500,
      letterSpacing: "0.24px",
      color: TEXT_DARK,
      flexShrink: 0,
    }}
  >
    {label}
  </div>
);

/**
 * Colour swatches, as the product card draws them: one dot per colour, the
 * merchant's own hex. A colour with no swatch hex renders as the same unfilled
 * chip the card shows, so the count still reads true.
 */
const SwatchRow = ({ hexes }: { hexes: readonly (string | null)[] }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
    {hexes.map((hex, index) => (
      <div
        // Two colourways can share a hex, so the index is the only stable key.
        key={`${hex ?? "none"}-${index}`}
        style={{
          display: "flex",
          width: 14,
          height: 14,
          borderRadius: 7,
          backgroundColor: hex ?? "transparent",
          border: `1px solid ${hex ? "#d4d4d8" : "#a1a1aa"}`,
        }}
      />
    ))}
  </div>
);

const productOgRender = ({
  image,
  siteTitle,
  title,
  price,
  strikePrice,
  discount,
  swatches,
}: ProductRenderProps) => (
  <FullBleed image={image}>
    <div style={barStyle}>
      <StoreName siteTitle={siteTitle} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          fontSize: 16,
          fontWeight: 500,
          color: TEXT_DARK,
        }}
      >
        {title ? (
          <span
            style={{
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              flexShrink: 1,
              minWidth: 0,
            }}
          >
            {truncate(title, 32)}
          </span>
        ) : null}
        {price ? <span style={{ flexShrink: 0 }}>{price}</span> : null}
        {strikePrice ? (
          <span
            style={{
              flexShrink: 0,
              color: "#71717a",
              textDecoration: "line-through",
            }}
          >
            {strikePrice}
          </span>
        ) : null}
        {discount ? <DiscountBadge label={discount} /> : null}
        {swatches && swatches.length > 0 ? (
          <SwatchRow hexes={swatches} />
        ) : null}
      </div>
    </div>
  </FullBleed>
);

const FONT_REGEX = /url\(([^)]+)\)/;

async function getTtfFont(
  family: string,
  axes: string[],
  value: number[]
): Promise<ArrayBuffer> {
  const familyParam = `${axes.join(",")}@${value.join(",")}`;

  // Get css style sheet with user agent Mozilla/5.0 Firefox/1.0 to ensure non-variable TTF is returned
  const cssCall = await fetch(
    `https://fonts.googleapis.com/css2?family=${family}:${familyParam}&display=swap`,
    {
      headers: {
        "User-Agent": "Mozilla/5.0 Firefox/1.0",
      },
    }
  );

  const css = await cssCall.text();
  const ttfUrl = css.match(FONT_REGEX)?.[1];

  if (!ttfUrl) {
    throw new Error("Failed to extract font URL from CSS");
  }

  return await fetch(ttfUrl).then((res) => res.arrayBuffer());
}

const getOptions = async ({
  width,
  height,
}: {
  width: number;
  height: number;
}): Promise<ImageResponseOptions> => {
  const [interRegular, interMedium] = await Promise.all([
    getTtfFont("Inter", ["wght"], [400]),
    getTtfFont("Inter", ["wght"], [500]),
  ]);
  return {
    width,
    height,
    // Override next/og's default `immutable, max-age=31536000` (1 year) so live
    // price/sale edits refresh: the CDN serves cached for 1h, then revalidates
    // in the background for up to a day (no user waits on a re-render).
    // Note: social crawlers cache the image by URL on their own servers, so
    // already-scraped links only update when the platform re-scrapes.
    headers: {
      "cache-control":
        "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
    fonts: [
      {
        name: "Inter",
        data: interRegular,
        style: "normal",
        weight: 400,
      },
      {
        name: "Inter",
        data: interMedium,
        style: "normal",
        weight: 500,
      },
    ],
  };
};

const getHomePageContent = async ({ id }: ContentProps) => {
  if (!id) {
    return;
  }
  const [result, err] = await getHomePageOGData(id);
  if (err || !result) {
    return;
  }
  return brandedPageRender({
    image: result.seoImage ?? result.image ?? OG_STATIC_IMAGE,
    siteTitle: result.siteTitle,
  });
};
const getSlugPageContent = async ({ id }: ContentProps) => {
  if (!id) {
    return;
  }
  const [result, err] = await getSlugPageOGData(id);
  if (err || !result) {
    return;
  }
  // Pages default to the static image, but honor an explicit image override.
  return brandedPageRender({
    image: result.seoImage ?? result.image ?? OG_STATIC_IMAGE,
    siteTitle: result.siteTitle,
    title: result.title,
  });
};

const getBlogPageContent = async ({ id }: ContentProps) => {
  if (!id) {
    return;
  }
  const [result, err] = await getBlogPageOGData(id);
  if (err || !result) {
    return;
  }
  // Blogs are dynamic — use the post's own image (full-bleed).
  return brandedPageRender({
    image: result.seoImage ?? result.image,
    siteTitle: result.siteTitle,
    title: result.title,
  });
};

/**
 * The bespoke product card. `id` is a BigCommerce `entityId`, and every figure
 * on the card — price, compare-at, markdown percentage, swatch hexes, image —
 * comes out of the one live product read, mapped by the same
 * `productToCardProps` the storefront's own card uses. That shared mapper is
 * what keeps the two from drifting apart on what "on sale" means.
 */
const getProductContent = async ({ id }: ContentProps) => {
  const entityId = Number(id);
  if (!Number.isInteger(entityId)) {
    return;
  }
  const [result, [settings]] = await Promise.all([
    getProductById(entityId),
    getStoreOGData(),
  ]);
  if (!(result.ok && result.data)) {
    return;
  }

  const card = productToCardProps(result.data);
  const { price, strikePrice, salePercent } = cardPricing(
    card.priceRange,
    card.compareAtPrice,
    card.currencyCode ?? OG_CURRENCY
  );

  return productOgRender({
    image: catalogImageUrl(card.imageUrl),
    siteTitle: settings?.siteTitle,
    title: card.title,
    price,
    strikePrice,
    discount: salePercent > 0 ? `-${salePercent}%` : undefined,
    swatches: (card.colors ?? [])
      .slice(0, OG_SWATCH_LIMIT)
      .map((color) => color.hex ?? null),
  });
};

/**
 * `id` is the category's storefront path segments, joined — the same value the
 * route itself resolves on, so a nested category needs no special case.
 */
const getCollectionContent = async ({ id }: ContentProps) => {
  if (!id) {
    return;
  }
  const [result, [settings]] = await Promise.all([
    // No product page: the card shows the category's own image and name, and
    // asking for one costs 4724 complexity against 1022.
    getCategoryByPath(id.split("/"), { withProducts: false }),
    getStoreOGData(),
  ]);
  if (!(result.ok && result.data.node)) {
    return;
  }
  // Collections are dynamic — use the collection's own image (full-bleed).
  return brandedPageRender({
    image: catalogImageUrl(result.data.node.defaultImage?.url),
    siteTitle: settings?.siteTitle,
    title: result.data.node.name,
  });
};

const getGenericPageContent = async ({ id }: ContentProps) => {
  if (!id) {
    return;
  }
  const [result, err] = await getGenericPageOGData(id);
  if (err || !result) {
    return;
  }
  return brandedPageRender({
    image: result.seoImage ?? result.image ?? OG_STATIC_IMAGE,
    siteTitle: result.siteTitle,
    title: result.title,
  });
};

const block = {
  homePage: getHomePageContent,
  page: getSlugPageContent,
  blog: getBlogPageContent,
  product: getProductContent,
  collection: getCollectionContent,
} as const;

export async function GET({ url }: Request): Promise<ImageResponse> {
  const { searchParams } = new URL(url);
  const type = searchParams.get("type") as keyof typeof block;
  const { width, height } = getOgMetaData(searchParams);
  const para = Object.fromEntries(searchParams.entries());
  const options = await getOptions({ width, height });
  const image = block[type] ?? getGenericPageContent;
  try {
    const content = await image(para);
    return new ImageResponse(content ?? fallbackContent(), options);
  } catch (_err) {
    return new ImageResponse(fallbackContent(), options);
  }
}
