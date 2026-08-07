import { sanityFetch } from "@workspace/sanity/live";
import {
  queryGlobalSeoSettings,
  queryNavbarData,
  queryPromoBannerData,
} from "@workspace/sanity/query";

/**
 * The root layout awaits this, so a failure here would fail every page in the
 * build. It does not need its own guard: `sanityFetch` degrades to null data
 * when the Content Lake is unreachable, and the navbar, promo banner and
 * settings each render their own empty state from a null.
 */
export const getNavigationData = async () => {
  const [navbarData, settingsData, promoBannerData] = await Promise.all([
    sanityFetch({ query: queryNavbarData }),
    sanityFetch({ query: queryGlobalSeoSettings }),
    sanityFetch({ query: queryPromoBannerData }),
  ]);

  return {
    navbarData: navbarData.data,
    settingsData: settingsData.data,
    promoBannerData: promoBannerData.data,
  };
};
