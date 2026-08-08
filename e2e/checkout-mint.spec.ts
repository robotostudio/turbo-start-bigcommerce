import { expect, test } from "@playwright/test";

/**
 * Checkout minted per click.
 *
 * The unit seam already proves the mutation is called twice and returns two
 * different URLs. What it cannot prove is that the second URL is one
 * BigCommerce will actually honour: the URL is single-use and its token is
 * issued per request, so a cached one works on the first click and fails on the
 * second, and the failure only exists across the network.
 *
 * This is also the shape of the reported failure: click Checkout, come back,
 * click it again. Both surfaces disable the button after a click and leave it
 * disabled on purpose — the window is leaving for BigCommerce — so the second
 * click is a second page load, not a double-click.
 *
 * The spec stops at the mint. The redirect is checked with a request that does
 * not follow it, so nothing here enters the hosted checkout, and the cart it
 * builds is deleted afterwards.
 */

/** The sanctioned mutation subject. One variant, so the PDP needs no picking. */
const PRODUCT_PATH = "/products/wren-washed-cap/";

const CART_COOKIE = "bigcommerce-cart-id";

const FOUND = 302;

/** What `/api/checkout` answers with. */
type CheckoutResponse =
  | { ok: true; url: string }
  | { ok: false; message: string };

/** Set once the cart exists, so the cleanup runs even on a failed assertion. */
let cartId: string | null = null;

const storefrontUrl =
  process.env.BIGCOMMERCE_API_URL ??
  `https://store-${process.env.BIGCOMMERCE_STORE_HASH}-${process.env.BIGCOMMERCE_CHANNEL_ID}.mybigcommerce.com/graphql`;

/**
 * The same endpoint and token the app uses, called directly.
 *
 * Deliberately a plain `fetch` rather than an import of `lib/bigcommerce`:
 * that module is `server-only` and validates its env through the web app's
 * schema, neither of which survives being pulled into a test runner.
 */
async function storefront(query: string, variables: Record<string, unknown>) {
  const response = await fetch(storefrontUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.BIGCOMMERCE_STOREFRONT_TOKEN}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  const body = (await response.json()) as {
    data?: Record<string, unknown>;
    errors?: { message: string }[];
  };

  if (body.errors?.length) {
    throw new Error(`Storefront error: ${body.errors[0]?.message}`);
  }

  return body.data;
}

test.afterEach(async () => {
  if (!cartId) return;

  await storefront(
    `mutation DeleteCart($input: DeleteCartInput!) {
      cart { deleteCart(input: $input) { deletedCartEntityId } }
    }`,
    { input: { cartEntityId: cartId } }
  );

  // `site.cart` answers null for a cart that no longer exists — the same check
  // `redirectToCheckout` uses to decide a cart is really gone. Asserted rather
  // than assumed: a delete that quietly failed would leave a cart on a shared
  // store and nothing would say so.
  const after = (await storefront(
    "query CartExists($id: String!) { site { cart(entityId: $id) { entityId } } }",
    { id: cartId }
  )) as { site: { cart: unknown } };

  expect(after.site.cart).toBeNull();
  cartId = null;
});

test("two clicks in a row mint two checkout URLs that both work", async ({
  context,
  page,
  request,
}) => {
  // Blocks the departure to BigCommerce without blocking the mint: the click,
  // the POST and the minted URL are all real, only `window.location.href` is
  // stopped at the door.
  await page.route(/mybigcommerce\.com/, (route) => route.abort());

  await page.goto(PRODUCT_PATH);
  // `.first()`: the related-products rail below the fold carries the same
  // label on every card, and the product's own button is the one above them.
  await page.getByRole("button", { name: "Add to cart" }).first().click();

  // The cookie is set by the response that created the cart, so waiting for it
  // is waiting for BigCommerce to have the line — the drawer renders the line
  // optimistically and would say yes before the store had heard of it.
  await expect
    .poll(async () =>
      (await context.cookies()).some((cookie) => cookie.name === CART_COOKIE)
    )
    .toBe(true);

  await page.goto("/cart");

  // Read in the route handler rather than from `waitForResponse`: the click
  // navigates the window the moment the URL arrives, and a response the page
  // navigated away from no longer has a readable body.
  const minted: CheckoutResponse[] = [];
  await page.route("**/api/checkout", async (route) => {
    const response = await route.fetch();
    minted.push((await response.json()) as CheckoutResponse);
    await route.fulfill({ response });
  });

  async function clickCheckout(): Promise<string> {
    const before = minted.length;
    await page.getByRole("button", { name: "Checkout" }).click();
    await expect.poll(() => minted.length).toBe(before + 1);

    const body = minted[before];
    expect(body?.ok, body?.ok ? "" : body?.message).toBe(true);
    return (body as { ok: true; url: string }).url;
  }

  cartId =
    (await context.cookies()).find((cookie) => cookie.name === CART_COOKIE)
      ?.value ?? null;
  expect(cartId).toBeTruthy();

  /**
   * Asks BigCommerce whether it honours the URL, without following it: a
   * followed redirect lands in the hosted checkout, which is past where this
   * stops. An honoured URL answers `302 /checkout`; a spent or invented one
   * answers `302 …/cart.php`, so the difference is visible in one hop.
   *
   * Checked immediately, because asking spends it — measured against the live
   * store, the same URL requested twice bounces to `cart.php` the second time.
   * That is the whole reason a URL cannot be minted once and reused.
   */
  async function expectHonoured(url: string) {
    const response = await request.get(url, { maxRedirects: 0 });
    expect(response.status()).toBe(FOUND);
    expect(response.headers().location).toContain("/checkout");
  }

  const first = await clickCheckout();
  await expectHonoured(first);

  // A fresh load of the cart, not a second click on the same button: the button
  // stays disabled after a click so a spent URL cannot be burned twice, which
  // makes coming back to the cart the only way a shopper reaches a second
  // checkout. `goto` rather than `reload`, because reloading would replay the
  // departure this test aborted.
  await page.goto("/cart");
  const second = await clickCheckout();
  await expectHonoured(second);

  expect(second).not.toBe(first);
});
