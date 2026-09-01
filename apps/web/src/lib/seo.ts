import type { Metadata } from "next";
import { cache } from "react";

import { getJsonLdSettings } from "@/lib/json-ld-data";
import { toMarkdownHref } from "@/lib/markdown/shared";
import type { Maybe } from "@/types";
import { capitalize, getBaseUrl } from "@/utils";

type SiteConfig = {
  title: string;
  description: string;
  twitterHandle?: string;
  keywords: string[];
  favicon?: { svg?: string | null; ico?: string | null } | null;
  ogImage?: string | null;
};

interface PageSeoData extends Metadata {
  title?: string;
  description?: string;
  /** Social-card overrides. Fall back to the page title/description. */
  ogTitle?: Maybe<string>;
  ogDescription?: Maybe<string>;
  /** An explicit card URL, winning over the generated one. */
  ogImage?: Maybe<string>;
  slug?: string;
  contentId?: string;
  contentType?: string;
  keywords?: string[];
  seoNoIndex?: boolean;
  pageType?: Extract<Metadata["openGraph"], { type: string }>["type"];
}

type OgImageParams = {
  type?: string;
  id?: string;
};

/**
 * The no-CMS state: a fresh clone, or a `sanityFetch` degraded to null. The
 * project's own name, so a fork inherits nobody else's identity.
 */
const FALLBACK_SITE_TITLE = "Turbo Start BigCommerce";
const FALLBACK_SITE_DESCRIPTION =
  "A headless commerce storefront built on BigCommerce, Sanity and Next.js.";
const SITE_KEYWORDS = [
  "bigcommerce",
  "sanity",
  "next",
  "react",
  "commerce",
  "template",
];

/**
 * Last resort, with neither a `contentId` to generate a card from nor a
 * `settings.ogImage`. That pair used to emit `/api/og?`, which renders the
 * handler's "Something went Wrong with image generation" card.
 */
const STATIC_OG_IMAGE = "/opengraph.png";

/** `@handle` from a twitter/x profile URL; undefined for anything else. */
function toTwitterHandle(url?: string): string | undefined {
  const handle = url?.match(
    /^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/([^/?#]+)/
  )?.[1];
  return handle ? `@${handle}` : undefined;
}

/**
 * One `cache()` slot shared with the structured data, so `generateMetadata` and
 * the layout's JSON-LD make one round trip between them. It reads `PUBLISHED`:
 * stega's invisible characters are corruption in a `<title>`, not an overlay.
 */
const getSiteConfig = cache(async (): Promise<SiteConfig> => {
  const data = await getJsonLdSettings();

  return {
    title: data?.siteTitle || FALLBACK_SITE_TITLE,
    description: data?.siteDescription || FALLBACK_SITE_DESCRIPTION,
    twitterHandle: toTwitterHandle(data?.socialLinks?.twitter),
    keywords: SITE_KEYWORDS,
    favicon: data?.favicon ?? null,
    ogImage: data?.ogImage ?? null,
  };
});

function generateOgImageUrl(params: OgImageParams = {}): string {
  const { type, id } = params;
  const searchParams = new URLSearchParams();

  if (id) {
    searchParams.set("id", id);
  }
  if (type) {
    searchParams.set("type", type);
  }

  const baseUrl = getBaseUrl();
  return `${baseUrl}/api/og?${searchParams.toString()}`;
}

function buildPageUrl({
  baseUrl,
  slug,
}: {
  baseUrl: string;
  slug: string;
}): string {
  const normalizedSlug = slug.startsWith("/") ? slug : `/${slug}`;
  return `${baseUrl}${normalizedSlug}`;
}

function extractTitle({
  pageTitle,
  slug,
  siteTitle,
}: {
  pageTitle?: Maybe<string>;
  slug: string;
  siteTitle: string;
}): string {
  if (pageTitle) {
    return pageTitle;
  }
  if (slug && slug !== "/") {
    return capitalize(slug.replace(/^\//, ""));
  }
  return siteTitle;
}

type SeoSourceDocument = {
  _id?: string | null;
  _type?: string | null;
  title?: string | null;
  description?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoNoIndex?: boolean | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
};

/**
 * One place, so a route cannot quietly forget a field the way `seoNoIndex` was
 * forgotten on every route until ROB-2546's follow-up. `slug` comes from the
 * route, not the document: it survives the fetch degrading to null, and a
 * missing document must not canonicalise itself to the homepage.
 */
export function seoFromDocument(
  doc: SeoSourceDocument | null | undefined,
  {
    slug,
    pageType,
    title: titleFallback,
    description: descriptionFallback,
  }: {
    slug: string;
    pageType?: PageSeoData["pageType"];
    /** Used when the document has neither a title nor an SEO override. */
    title?: string;
    description?: string;
  }
): Promise<Metadata> {
  return getSEOMetadata({
    // `||`, not `??`: a cleared override leaves `""`, which `??` treats as a
    // value — the title would fall through to a slug-derived one.
    title: doc?.seoTitle || doc?.title || titleFallback,
    description: doc?.seoDescription || doc?.description || descriptionFallback,
    ogTitle: doc?.ogTitle,
    ogDescription: doc?.ogDescription,
    seoNoIndex: doc?.seoNoIndex ?? false,
    contentId: doc?._id ?? undefined,
    contentType: doc?._type ?? undefined,
    slug,
    pageType,
  });
}

export async function getSEOMetadata(
  page: PageSeoData = {}
): Promise<Metadata> {
  const {
    title: pageTitle,
    description: pageDescription,
    ogTitle,
    ogDescription,
    ogImage: pageOgImage,
    slug = "/",
    contentId,
    contentType,
    keywords: pageKeywords = [],
    seoNoIndex = false,
    pageType = "website",
    ...pageOverrides
  } = page;

  const siteConfig = await getSiteConfig();
  const baseUrl = getBaseUrl();
  const pageUrl = buildPageUrl({ baseUrl, slug });

  const defaultTitle = extractTitle({
    pageTitle,
    slug,
    siteTitle: siteConfig.title,
  });
  const defaultDescription = pageDescription || siteConfig.description;
  // The Studio's Open Graph group — a social headline distinct from `<title>`.
  const socialTitle = ogTitle || defaultTitle;
  const socialDescription = ogDescription || defaultDescription;
  const allKeywords = [...siteConfig.keywords, ...pageKeywords];

  // Explicit override, then the generated card (only meaningful with an id to
  // resolve), then the editor's default, then the shipped image.
  const ogImage =
    pageOgImage ??
    (contentId
      ? generateOgImageUrl({ type: contentType, id: contentId })
      : (siteConfig.ogImage ?? `${baseUrl}${STATIC_OG_IMAGE}`));

  const fullTitle =
    defaultTitle === siteConfig.title
      ? defaultTitle
      : `${defaultTitle} | ${siteConfig.title}`;

  // SVG first, ICO for Safari. The shipped pair lives in `public/`, not `app/`:
  // a `favicon.ico` there is a Next file convention that injects its own
  // competing <link>.
  const faviconIcons = [
    ...(siteConfig.favicon?.svg
      ? [{ url: siteConfig.favicon.svg, type: "image/svg+xml" }]
      : []),
    {
      url: siteConfig.favicon?.ico ?? `${baseUrl}/favicon.ico`,
      sizes: "16x16 32x32 48x48",
    },
  ];

  // The Markdown twin, also reachable via `Accept: text/markdown`. Withheld on
  // a noindex page: advertising an alternate representation of a page you asked
  // not to be indexed undoes the request.
  const markdownTypes = seoNoIndex
    ? undefined
    : { "text/markdown": `${baseUrl}${toMarkdownHref(slug)}` };

  const defaultMetadata: Metadata = {
    title: fullTitle,
    description: defaultDescription,
    metadataBase: new URL(baseUrl),
    creator: siteConfig.title,
    authors: [{ name: siteConfig.title }],
    icons: { icon: faviconIcons },
    keywords: allKeywords,
    robots: seoNoIndex ? "noindex, nofollow" : "index, follow",
    twitter: {
      card: "summary_large_image",
      images: [ogImage],
      creator: siteConfig.twitterHandle,
      title: socialTitle,
      description: socialDescription,
    },
    alternates: {
      canonical: pageUrl,
      types: markdownTypes,
    },
    openGraph: {
      type: pageType ?? "website",
      // No `countryName`: hardcoded to "UK" it described whoever forked this
      // rather than their store, and there is no sane default.
      description: socialDescription,
      title: socialTitle,
      siteName: siteConfig.title,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: socialTitle,
          secureUrl: ogImage,
        },
      ],
      url: pageUrl,
    },
  };

  // Merged, not replaced: a spread overwrites the whole key, so a caller adding
  // a language alternate used to drop the canonical with it.
  const { alternates: alternatesOverride, ...restOverrides } = pageOverrides;
  return {
    ...defaultMetadata,
    ...restOverrides,
    alternates: { ...defaultMetadata.alternates, ...alternatesOverride },
  };
}
