#!/usr/bin/env node
/**
 * Parity harness: captures the reference (Shopify) storefront and diffs the
 * local (BigCommerce) one against it, route by route.
 *
 * Usage:
 *   node scripts/parity/parity.mjs baseline   # capture the reference, once
 *   node scripts/parity/parity.mjs report     # fetch local, diff, report
 *
 * Environment:
 *   PARITY_DIR   where baseline + reports live (default: <os tmp>/turbo-parity)
 *   PARITY_REF   reference base URL   (default: the deployed Shopify starter)
 *   PARITY_LOCAL local base URL       (default: http://localhost:3000)
 *
 * The baseline is stored as raw HTML and re-extracted on every report, so the
 * noise filters can evolve without recapturing. Nothing here writes to the
 * repo — reports land in PARITY_DIR.
 *
 * Ignored by construction (never reported as differences):
 *   - build-chunk and any other /_next/static asset URLs
 *   - font/asset preloads (filtered with the rest of non-navigation hrefs)
 *   - the Sanity project id in image CDN URLs: the two sides read from
 *     different projects, so both collapse to a __SANITY__ token first
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const REF_BASE = process.env.PARITY_REF ?? "https://turbo-start-shopify-web.vercel.app";
const LOCAL_BASE = process.env.PARITY_LOCAL ?? "http://localhost:3000";
const DIR =
  process.env.PARITY_DIR ??
  path.join(os.tmpdir(), "turbo-start-big-commerce", "parity");

const BASELINE_DIR = path.join(DIR, "baseline");
const MANIFEST = path.join(BASELINE_DIR, "manifest.json");

/** Routes checked on both sides. A blog post is discovered from /blog. */
const ROUTES = [
  "/",
  "/collections",
  "/collections/jackets",
  "/collections/all-products",
  "/collections/sale",
  "/collections/shirts",
  "/products/rye-leather-moto-jacket",
  "/products/aster-denim-coach-jacket",
  "/products/wren-washed-cap",
  "/blog",
  "/about-us",
  "/careers",
  "/search",
  "/cart",
];

const FETCH_TIMEOUT_MS = 90_000;
const CONCURRENCY = 3;
/** Max diff lines printed per route per section before truncating. */
const MAX_DIFF_LINES = 40;

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

async function fetchPage(base, route) {
  const url = `${base}${route}`;
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "user-agent": "parity-harness" },
    });
    return {
      route,
      status: response.status,
      redirected: response.redirected,
      finalUrl: response.url,
      html: await response.text(),
    };
  } catch (error) {
    return {
      route,
      status: 0,
      redirected: false,
      finalUrl: url,
      html: "",
      error: String(error?.cause ?? error),
    };
  }
}

/** Small concurrency pool — a dev server compiling routes dislikes 15 at once. */
async function fetchAll(base, routes) {
  const results = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, routes.length) }, async () => {
      while (next < routes.length) {
        const index = next++;
        results[index] = await fetchPage(base, routes[index]);
      }
    })
  );
  return results;
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

const ENTITIES = [
  [/&nbsp;/g, " "],
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&quot;/g, '"'],
  [/&#x27;|&#39;/g, "'"],
  [/&amp;/g, "&"],
];

function decodeEntities(text) {
  return ENTITIES.reduce((out, [pattern, char]) => out.replace(pattern, char), text);
}

/**
 * Collapses expected environment differences so they never read as diffs:
 * the Sanity project id (CDN paths and API preconnects) and each side's own
 * absolute origin (canonical/alternate links, share URLs).
 */
function normalizeNoise(text) {
  return text
    .replace(/cdn\.sanity\.io\/images\/[a-z0-9]+/g, "cdn.sanity.io/images/__SANITY__")
    .replace(/https?:\/\/[a-z0-9]+\.api\.sanity\.io/g, "https://__SANITY__.api.sanity.io")
    .replaceAll(REF_BASE, "")
    .replaceAll(LOCAL_BASE, "");
}

/** Everything invisible or environment-specific goes before text extraction. */
function stripInvisible(html) {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    // React streams <title>/<meta> into the body before hoisting them; which
    // side does so depends on render timing, so they are never "visible text".
    .replace(/<title[\s\S]*?<\/title>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<template[\s\S]*?<\/template>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

const BLOCK_END = /<\/(?:p|div|li|ul|ol|h[1-6]|tr|td|th|section|article|header|footer|nav|figcaption|blockquote|button|a|span)>|<br\s*\/?>/gi;

/** Visible text as trimmed, non-empty lines in document order. */
function extractTextLines(html) {
  const text = stripInvisible(html)
    .replace(BLOCK_END, "$&\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(normalizeNoise(text))
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Navigation hrefs, sorted + deduped. Asset and framework URLs are dropped. */
function extractHrefs(html) {
  const hrefs = new Set();
  for (const match of html.matchAll(/href="([^"]*)"/g)) {
    const href = decodeEntities(match[1]);
    if (
      href.includes("/_next/") ||
      /\.(?:css|js|woff2?|ico|png|svg|webmanifest)(?:\?|$)/.test(href) ||
      href.startsWith("data:") ||
      // preconnect/dns-prefetch hints, not navigation
      href === "https://cdn.sanity.io"
    ) {
      continue;
    }
    const normalized = normalizeNoise(href);
    if (normalized) hrefs.add(normalized);
  }
  return [...hrefs].sort();
}

/** `h2: Shop the look` in document order. */
function extractHeadings(html) {
  const headings = [];
  const source = stripInvisible(html);
  for (const match of source.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const text = decodeEntities(match[2].replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
    if (text) headings.push(`h${match[1]}: ${text}`);
  }
  return headings;
}

/** Every rendered GBP price string, in document order, duplicates kept. */
function extractPrices(textLines) {
  const prices = [];
  for (const line of textLines) {
    for (const match of line.matchAll(/£\s?\d[\d,]*(?:\.\d{2})?/g)) {
      prices.push(match[0].replace(/\s/g, ""));
    }
  }
  return prices;
}

function extract(html) {
  const textLines = extractTextLines(html);
  return {
    textLines,
    hrefs: extractHrefs(html),
    headings: extractHeadings(html),
    prices: extractPrices(textLines),
  };
}

// ---------------------------------------------------------------------------
// Diff (LCS over lines — inputs are a few hundred lines at most)
// ---------------------------------------------------------------------------

function diffLines(a, b) {
  const n = a.length;
  const m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push(`- ${a[i++]}`);
    } else {
      out.push(`+ ${b[j++]}`);
    }
  }
  while (i < n) out.push(`- ${a[i++]}`);
  while (j < m) out.push(`+ ${b[j++]}`);
  return out;
}

function renderDiff(label, refValues, localValues) {
  const diff = diffLines(refValues, localValues);
  if (diff.length === 0) return { count: 0, block: null };
  const shown = diff.slice(0, MAX_DIFF_LINES);
  const truncated = diff.length - shown.length;
  const lines = [
    `#### ${label} (−ref / +local, ${diff.length} lines)`,
    "```diff",
    ...shown,
    ...(truncated > 0 ? [`… ${truncated} more`] : []),
    "```",
  ];
  return { count: diff.length, block: lines.join("\n") };
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

function routeSlug(route) {
  return route === "/" ? "home" : route.replace(/^\//, "").replace(/\//g, "__");
}

/** First on-site blog-post link on /blog, so both sides get the same slug. */
function discoverBlogPost(blogHtml) {
  for (const href of extractHrefs(blogHtml)) {
    if (/^\/blog\/[^/]+$/.test(href)) return href;
  }
  return null;
}

async function captureBaseline() {
  await mkdir(BASELINE_DIR, { recursive: true });
  console.log(`Capturing reference: ${REF_BASE}`);

  const pages = await fetchAll(REF_BASE, ROUTES);

  const blogPage = pages.find((page) => page.route === "/blog");
  const blogPost = blogPage ? discoverBlogPost(blogPage.html) : null;
  if (blogPost) {
    pages.push(await fetchPage(REF_BASE, blogPost));
  } else {
    console.warn("No blog post link found on /blog — skipping that route.");
  }

  const manifest = {
    capturedAt: new Date().toISOString(),
    base: REF_BASE,
    blogPost,
    routes: [],
  };

  for (const page of pages) {
    const file = `${routeSlug(page.route)}.html`;
    await writeFile(path.join(BASELINE_DIR, file), page.html);
    manifest.routes.push({
      route: page.route,
      status: page.status,
      redirected: page.redirected,
      finalUrl: page.finalUrl,
      error: page.error,
      file,
    });
    console.log(`  ${page.status} ${page.route}${page.error ? ` (${page.error})` : ""}`);
  }

  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`Baseline written to ${BASELINE_DIR}`);
}

function summarizeRoute(entry) {
  const { route, refStatus, localStatus, sections, error } = entry;
  const statusPair = `${refStatus}/${localStatus}`;
  if (error) return `| ${route} | ${statusPair} | — | — | — | — | FAIL |`;
  const cell = (section) => (section.count === 0 ? "·" : `Δ${section.count}`);
  const verdict =
    refStatus !== localStatus
      ? "FAIL"
      : Object.values(sections).every((section) => section.count === 0)
        ? "MATCH"
        : "DIFF";
  return `| ${route} | ${statusPair} | ${cell(sections.text)} | ${cell(sections.hrefs)} | ${cell(sections.headings)} | ${cell(sections.prices)} | ${verdict} |`;
}

async function report() {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  } catch {
    console.error(`No baseline manifest at ${MANIFEST} — run "baseline" first.`);
    process.exit(1);
  }

  console.log(`Reference baseline: ${manifest.base} (${manifest.capturedAt})`);
  console.log(`Local:              ${LOCAL_BASE}\n`);

  const routes = manifest.routes.map((entry) => entry.route);
  const localPages = await fetchAll(LOCAL_BASE, routes);

  const entries = [];
  const details = [];

  for (const [index, refEntry] of manifest.routes.entries()) {
    const localPage = localPages[index];
    const refHtml = await readFile(path.join(BASELINE_DIR, refEntry.file), "utf8");
    const ref = extract(refHtml);
    const local = extract(localPage.html);

    const sections = {
      text: renderDiff("Visible text", ref.textLines, local.textLines),
      hrefs: renderDiff("Hrefs", ref.hrefs, local.hrefs),
      headings: renderDiff("Headings", ref.headings, local.headings),
      prices: renderDiff("Prices", ref.prices, local.prices),
    };

    entries.push({
      route: refEntry.route,
      refStatus: refEntry.status,
      localStatus: localPage.status,
      sections,
      error: localPage.error,
    });

    const blocks = Object.values(sections)
      .map((section) => section.block)
      .filter(Boolean);
    if (
      blocks.length > 0 ||
      refEntry.status !== localPage.status ||
      localPage.error
    ) {
      details.push(
        [
          `### ${refEntry.route}`,
          `status ref=${refEntry.status} local=${localPage.status}` +
            (localPage.redirected ? ` (local redirected to ${localPage.finalUrl})` : "") +
            (localPage.error ? ` — fetch error: ${localPage.error}` : ""),
          ...blocks,
        ].join("\n\n")
      );
    }
  }

  const summary = [
    "| route | status ref/local | text | hrefs | headings | prices | verdict |",
    "|---|---|---|---|---|---|---|",
    ...entries.map(summarizeRoute),
  ].join("\n");

  const reportBody = [
    "# Parity report",
    `Reference: ${manifest.base} (captured ${manifest.capturedAt})`,
    `Local: ${LOCAL_BASE} — ${new Date().toISOString()}`,
    "",
    "## Summary",
    summary,
    "",
    "## Differences by route",
    ...(details.length > 0 ? details : ["All routes match."]),
    "",
  ].join("\n");

  const reportFile = path.join(DIR, "parity-report.md");
  await writeFile(reportFile, reportBody);

  console.log(summary);
  console.log(`\nFull report: ${reportFile}`);
}

const mode = process.argv[2];
if (mode === "baseline") {
  await captureBaseline();
} else if (mode === "report") {
  await report();
} else {
  console.log("Usage: node scripts/parity/parity.mjs <baseline|report>");
  process.exit(1);
}
