import { type NextRequest, NextResponse } from "next/server";

import { normalizeMarkdownPath, prefersMarkdown } from "@/lib/markdown/path";

/**
 * Content negotiation for AI agents. A request that either ends in `.md` or
 * prefers `Accept: text/markdown` is rewritten to the `/api/markdown` route,
 * which serves a Markdown representation of the same content a browser would
 * get as HTML. Everything else passes straight through unchanged.
 *
 * Next.js 16's `proxy` convention (the former `middleware`).
 */
export function proxy(request: NextRequest): NextResponse {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const hasMdSuffix = pathname.endsWith(".md");
  const wantsMarkdown =
    hasMdSuffix || prefersMarkdown(request.headers.get("accept") ?? "");

  if (!wantsMarkdown) return NextResponse.next();

  const rawPath = hasMdSuffix ? pathname.slice(0, -3) : pathname;

  // Header-only negotiation must not hijack asset files (e.g. a `.png` fetched
  // with a broad `Accept`). The explicit `.md` suffix has no such ambiguity.
  const lastSegment = rawPath.split("/").pop() ?? "";
  if (!hasMdSuffix && lastSegment.includes(".")) {
    return NextResponse.next();
  }

  const contentPath = normalizeMarkdownPath(rawPath);

  // A rewrite's query params aren't reliably readable downstream, but request
  // headers are — so forward the path via both.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-markdown-path", contentPath);

  const url = request.nextUrl.clone();
  url.pathname = "/api/markdown";
  url.search = "";
  url.searchParams.set("path", contentPath);
  return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/((?!api/|_next/|favicon.ico|robots.txt|sitemap.xml|llms\\.txt|opengraph.png).*)",
  ],
};
