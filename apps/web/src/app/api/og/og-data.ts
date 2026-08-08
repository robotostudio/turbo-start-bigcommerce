import { client } from "@workspace/sanity/client";
import {
  queryBlogPageOGData,
  queryGenericPageOGData,
  queryHomePageOGData,
  querySettingsData,
  querySlugPageOGData,
} from "@workspace/sanity/query";

import { handleErrors } from "@/utils";

export async function getHomePageOGData(id: string) {
  return await handleErrors(client.fetch(queryHomePageOGData, { id }));
}

export async function getSlugPageOGData(id: string) {
  return await handleErrors(client.fetch(querySlugPageOGData, { id }));
}

export async function getBlogPageOGData(id: string) {
  return await handleErrors(client.fetch(queryBlogPageOGData, { id }));
}

export async function getGenericPageOGData(id: string) {
  return await handleErrors(client.fetch(queryGenericPageOGData, { id }));
}

/**
 * Products and categories have no Sanity document to read, so their cards
 * fetch BigCommerce directly and come here only for the store name that sits
 * in the bar — the one part of a catalog card that is editorial.
 */
export async function getStoreOGData() {
  return await handleErrors(client.fetch(querySettingsData));
}
