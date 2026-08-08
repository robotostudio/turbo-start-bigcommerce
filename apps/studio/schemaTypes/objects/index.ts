import { productWithVariantReference } from "./bigcommerce/product-with-variant";
import { collectionGroup } from "./collection/collection-group";
import { collectionLinks } from "./collection/collection-links";
import { footer } from "./global/footer";
import { menu } from "./global/menu";
import { menuLinks } from "./global/menu-links";
import { notFoundPage } from "./global/not-found-page";
import { imageWithProductHotspots } from "./hotspot/image-with-product-hotspots";
import { productHotspots } from "./hotspot/product-hotspots";
import { spot } from "./hotspot/spot";
import { linkEmail } from "./link/link-email";
import { linkExternal } from "./link/link-external";
import { linkInternal } from "./link/link-internal";
import { accordion } from "./module/accordion";
import { accordionGroup } from "./module/accordion-group";
import { callToAction } from "./module/call-to-action";
import { callout } from "./module/callout";
import { collectionReference } from "./module/collection-reference";
import { instagram } from "./module/instagram";
import { seo } from "./seo";

export const annotations = [linkEmail, linkExternal, linkInternal];

export const objects = [
  accordionGroup,
  accordion,
  callout,
  callToAction,
  collectionGroup,
  collectionLinks,
  collectionReference,
  footer,
  imageWithProductHotspots,
  instagram,
  menuLinks,
  menu,
  notFoundPage,
  productHotspots,
  productWithVariantReference,
  seo,
  spot,
];
