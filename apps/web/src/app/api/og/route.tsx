/** biome-ignore-all lint/performance/noImgElement: this is a edge runtime function */
import { env } from "@workspace/env/client";
import { ImageResponse } from "next/og";
import type { ImageResponseOptions } from "next/server";
import type { CSSProperties, ReactNode } from "react";

import { getColorHex } from "@/lib/shopify/color";
import type { Maybe } from "@/types";
import { getBaseUrl } from "@/utils";
import { getOgMetaData } from "./og-config";
import {
  getBlogPageOGData,
  getCollectionOGData,
  getGenericPageOGData,
  getHomePageOGData,
  getProductOGData,
  getSlugPageOGData,
} from "./og-data";

export const runtime = "edge";

const errorContent = (
  <div tw="flex flex-col w-full h-full items-center justify-center">
    <div tw=" flex w-full h-full items-center justify-center ">
      <h1 tw="text-white">Something went Wrong with image generation</h1>
    </div>
  </div>
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
  price?: Maybe<string>;
  /** Comma-separated hex list of all available colors. */
  swatches?: Maybe<string>;
  /** Preformatted markdown label, e.g. "-16%". */
  discount?: Maybe<string>;
};

type OgVariant = { price: number | null; compareAtPrice: number | null };

const MAX_SWATCHES = 6;

// Normal pages (home / page / collection) all use this single static full-bleed
// image. Only products (and blogs) use a dynamic image.
const OG_STATIC_IMAGE = `${getBaseUrl()}/opengraph.png`;

// Sanity stores product prices as bare numbers (store.priceRange.minVariantPrice)
// without a currency code, so we format with the store's currency here
// (configurable per store via NEXT_PUBLIC_STORE_CURRENCY, defaults to GBP).
const OG_CURRENCY = env.NEXT_PUBLIC_STORE_CURRENCY;

const formatOgPrice = (price: Maybe<number>): string | undefined => {
  if (price === null || price === undefined) return;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: OG_CURRENCY,
  }).format(price);
};

/** Resolve the product's color option values to a comma-separated hex list. */
const resolveSwatches = (
  colors: Maybe<Array<{ name: string | null; values: Array<string> | null }>>
): string | undefined => {
  const colorOption = colors?.find((o) => o.name && /colou?r/i.test(o.name));
  const hexes = (colorOption?.values ?? [])
    .map((value) => getColorHex(value))
    .filter((hex): hex is string => Boolean(hex));
  return hexes.length > 0 ? hexes.join(",") : undefined;
};

/**
 * Markdown label for the cheapest variant (the one whose price the OG shows via
 * `minVariantPrice`). Returns e.g. "-16%", or undefined when it isn't on sale.
 */
const resolveDiscount = (
  variants: Maybe<Array<OgVariant | null>>
): string | undefined => {
  let price: number | undefined;
  let compareAtPrice: number | null = null;
  for (const variant of variants ?? []) {
    if (!variant || variant.price === null) continue;
    if (price === undefined || variant.price < price) {
      price = variant.price;
      compareAtPrice = variant.compareAtPrice;
    }
  }
  if (
    price === undefined ||
    compareAtPrice === null ||
    compareAtPrice <= price
  ) {
    return;
  }
  const percent = Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
  return percent > 0 ? `-${percent}%` : undefined;
};

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

const SHOPIFY_MARK = svgDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 18"><path d="M13.5388 3.41608C13.5262 3.32784 13.4506 3.27742 13.3875 3.27742C13.3245 3.27742 12.0766 3.25221 12.0766 3.25221C12.0766 3.25221 11.0304 2.24381 10.9295 2.13036C10.8287 2.02952 10.627 2.05473 10.5514 2.07994C10.5514 2.07994 10.3497 2.14297 10.022 2.24381C9.97156 2.06734 9.88333 1.85305 9.76988 1.62616C9.40434 0.92028 8.84972 0.542129 8.19425 0.542129C8.14383 0.542129 8.10602 0.542129 8.0556 0.554734C8.03039 0.529524 8.01778 0.504314 7.99257 0.491709C7.70266 0.189188 7.33711 0.0379276 6.89593 0.0505326C6.0514 0.0757427 5.20686 0.69339 4.51358 1.77742C4.03459 2.54633 3.66904 3.50431 3.5556 4.24801C2.58501 4.55053 1.90434 4.76482 1.87913 4.76482C1.38753 4.91608 1.37493 4.92868 1.3119 5.39507C1.28669 5.74801 0.000976562 15.6934 0.000976562 15.6934L10.7909 17.5589L15.4674 16.3993C15.4548 16.3993 13.5514 3.50431 13.5388 3.41608ZM9.47997 2.42028C9.22787 2.49591 8.95056 2.58415 8.64804 2.68499C8.64804 2.25641 8.58501 1.65137 8.39593 1.14717C9.03879 1.24801 9.35392 1.9791 9.47997 2.42028ZM8.08081 2.84885C7.51358 3.02532 6.89593 3.2144 6.27829 3.40347C6.45476 2.73541 6.78249 2.07994 7.18585 1.63877C7.33711 1.4749 7.5514 1.29843 7.79089 1.19759C8.04299 1.68919 8.09341 2.38247 8.08081 2.84885ZM6.92114 0.617759C7.12283 0.617759 7.28669 0.655575 7.42535 0.756415C7.19846 0.86986 6.97156 1.04633 6.76988 1.27322C6.22787 1.85305 5.8119 2.74801 5.64804 3.61776C5.13123 3.78163 4.62703 3.93289 4.17324 4.07154C4.47577 2.69759 5.62283 0.655575 6.92114 0.617759Z" fill="#95BF47"/><path d="M13.3867 3.27747C13.3237 3.27747 12.0758 3.25226 12.0758 3.25226C12.0758 3.25226 11.0295 2.24385 10.9287 2.13041C10.8909 2.09259 10.8405 2.06738 10.79 2.06738V17.559L15.4665 16.3993C15.4665 16.3993 13.5631 3.50436 13.5505 3.41612C13.5253 3.32789 13.4497 3.27747 13.3867 3.27747Z" fill="#5E8E3E"/><path d="M8.19335 5.68484L7.65133 7.71425C7.65133 7.71425 7.04629 7.43694 6.32781 7.48736C5.26898 7.55039 5.26898 8.21845 5.26898 8.38232C5.33201 9.28988 7.71436 9.49156 7.85302 11.6218C7.95386 13.2983 6.97066 14.4453 5.53369 14.5336C3.8194 14.6218 2.87402 13.6134 2.87402 13.6134L3.23957 12.063C3.23957 12.063 4.19755 12.7815 4.95386 12.7311C5.44545 12.7058 5.63453 12.2899 5.60932 12.0126C5.53369 10.8277 3.59251 10.9033 3.46646 8.94955C3.36562 7.31089 4.43705 5.65963 6.8068 5.50837C7.72696 5.44534 8.19335 5.68484 8.19335 5.68484Z" fill="#ffffff"/></svg>'
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
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
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
          <CreditMark src={SHOPIFY_MARK} />
          <span style={{ fontWeight: 500 }}>Shopify</span>
        </CreditGroup>
      </div>
    </div>
  </FullBleed>
);

const SwatchRow = ({ swatches }: { swatches: string }) => {
  const hexes = swatches.split(",").filter(Boolean);
  if (hexes.length === 0) return null;
  const shown = hexes.slice(0, MAX_SWATCHES);
  const overflow = hexes.length - shown.length;
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}
    >
      {shown.map((hex, i) => (
        <div
          key={`${hex}-${i}`}
          style={{
            width: 20,
            height: 20,
            backgroundColor: hex,
            border: "1px solid rgba(0,0,0,0.08)",
            flexShrink: 0,
          }}
        />
      ))}
      {overflow > 0 ? (
        <span style={{ fontSize: 14, color: "#71717a" }}>+{overflow}</span>
      ) : null}
    </div>
  );
};

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

const productOgRender = ({
  image,
  siteTitle,
  title,
  price,
  swatches,
  discount,
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
        {swatches ? <SwatchRow swatches={swatches} /> : null}
        {price ? <span style={{ flexShrink: 0 }}>{price}</span> : null}
        {discount ? <DiscountBadge label={discount} /> : null}
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

const getProductContent = async ({ id }: ContentProps) => {
  if (!id) {
    return;
  }
  const [result, err] = await getProductOGData(id);
  if (err || !result) {
    return;
  }
  // Everything is sourced from Sanity (Shopify data synced into store.*).
  return productOgRender({
    image: result.seoImage ?? result.image,
    siteTitle: result.siteTitle,
    title: result.title,
    price: formatOgPrice(result.price),
    swatches: resolveSwatches(result.colors),
    discount: resolveDiscount(result.variants),
  });
};

const getCollectionContent = async ({ id }: ContentProps) => {
  if (!id) {
    return;
  }
  const [result, err] = await getCollectionOGData(id);
  if (err || !result) {
    return;
  }
  // Collections are dynamic — use the collection's own image (full-bleed).
  return brandedPageRender({
    image: result.seoImage ?? result.image,
    siteTitle: result.siteTitle,
    title: result.title,
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
    return new ImageResponse(content ? content : errorContent, options);
  } catch (_err) {
    return new ImageResponse(errorContent, options);
  }
}
