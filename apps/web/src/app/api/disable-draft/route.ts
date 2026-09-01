import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

/**
 * The WHATWG URL parser strips tabs and newlines *before* working out the
 * origin, so `/<TAB>/evil.example` is checked as that literal and then resolved
 * as `//evil.example` — an off-origin redirect every "starts with a slash"
 * guard waves through. A codepoint scan, not a regex: the character class would
 * hold the control characters themselves (`noControlCharactersInRegex`).
 */
function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * The `?slug` to return to, or `/` if it is not a path on this origin.
 *
 * The parameter used to go straight to `redirect()`, so
 * `?slug=https://evil.example` sent the visitor there — an open redirect on an
 * unauthenticated GET, phishable because the link starts on our own domain.
 * `//host` and `/\host` are protocol-relative despite the leading slash.
 */
function safeRedirectPath(raw: string | null): string {
  if (!raw || hasControlChar(raw)) {
    return "/";
  }
  if (!raw.startsWith("/")) {
    return "/";
  }
  if (raw.startsWith("//") || raw.startsWith("/\\")) {
    return "/";
  }
  return raw;
}

export async function GET(request: NextRequest) {
  const redirectUrl = safeRedirectPath(
    request.nextUrl.searchParams.get("slug")
  );

  (await draftMode()).disable();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  redirect(redirectUrl);
}
