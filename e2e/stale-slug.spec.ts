import { expect, test } from "@playwright/test";

/**
 * A stale slug reaches the canonical product page.
 *
 * BigCommerce keeps a 301 when a product's URL changes, and `site.route` is
 * asked for `redirectBehavior: FOLLOW` so the storefront learns about it. None
 * of that can be faked at the unit seam: the fixture would be asserting what
 * this repo thinks BigCommerce answers, which is the thing worth checking.
 *
 * The store carries one durable redirect for this — `/products/wren-washed-cap-old/`
 * to the Wren Washed Cap product — created by hand against the Admin API,
 * because the catalog seed has no notion of redirects (see ROB-2553). It
 * shadows no real path, so nothing else on the store sees it.
 *
 * The assertion is the URL the shopper ends up on, not the redirect itself: a
 * redirect that leaves for BigCommerce's own domain is still a redirect, and
 * still a dead end for a shopper who was reading this storefront.
 */

const STALE_PATH = "/products/wren-washed-cap-old/";
/** No trailing slash: BigCommerce's paths carry one, Next's router drops it. */
const CANONICAL_PATH = "/products/wren-washed-cap";

test("a stale product slug lands on the canonical page, on this storefront", async ({
  page,
}) => {
  await page.goto(STALE_PATH);

  // A string, not a pattern: it resolves against `baseURL`, so this fails if
  // the shopper ends up on the right path on the wrong origin.
  await expect(page).toHaveURL(CANONICAL_PATH);
  await expect(
    page.getByRole("heading", { name: "Wren Washed Cap" })
  ).toBeVisible();
});
