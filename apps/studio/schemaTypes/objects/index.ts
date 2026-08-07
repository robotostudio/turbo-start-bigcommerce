import { collectionGroup } from "./collection/collection-group";
import { collectionLinks } from "./collection/collection-links";
import { footer } from "./global/footer";
import { menuLinks } from "./global/menu-links";
import { menu } from "./global/menu";
import { notFoundPage } from "./global/not-found-page";
import { imageWithProductHotspots } from "./hotspot/image-with-product-hotspots";
import { productHotspots } from "./hotspot/product-hotspots";
import { spot } from "./hotspot/spot";
import { linkEmail } from "./link/link-email";
import { linkExternal } from "./link/link-external";
import { linkInternal } from "./link/link-internal";
import { accordionGroup } from "./module/accordion-group";
import { accordion } from "./module/accordion";
import { callout } from "./module/callout";
import { callToAction } from "./module/call-to-action";
import { collectionReference } from "./module/collection-reference";
import { instagram } from "./module/instagram";
import { seo } from "./seo";
import { collectionRule } from "./shopify/collection-rule";
import { inventory } from "./shopify/inventory";
import { option } from "./shopify/option";
import { placeholderString } from "./shopify/placeholder-string";
import { priceRange } from "./shopify/price-range";
import { productWithVariant } from "./shopify/product-with-variant";
import { proxyString } from "./shopify/proxy-string";
import { shopifyCollection } from "./shopify/shopify-collection";
import { shopifyProduct } from "./shopify/shopify-product";
import { shopifyProductVariant } from "./shopify/shopify-product-variant";
import { shop } from "./shopify/shop";

export const annotations = [linkEmail, linkExternal, linkInternal];

export const objects = [
  accordionGroup,
  accordion,
  callout,
  callToAction,
  collectionGroup,
  collectionLinks,
  collectionReference,
  collectionRule,
  footer,
  imageWithProductHotspots,
  instagram,
  inventory,
  menuLinks,
  menu,
  notFoundPage,
  option,
  placeholderString,
  priceRange,
  productHotspots,
  productWithVariant,
  proxyString,
  seo,
  shopifyCollection,
  shopifyProduct,
  shopifyProductVariant,
  shop,
  spot,
];
