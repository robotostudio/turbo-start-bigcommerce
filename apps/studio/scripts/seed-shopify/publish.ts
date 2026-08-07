/** Publishes products and collections to all sales channel publications. */

import { adminQuery, hasUserErrors, log } from "./client.js";
import type { UserError } from "./types.js";

/** Fetches all publication IDs from the store. */
async function getPublicationIds(): Promise<string[]> {
  const result = await adminQuery<{
    publications: {
      edges: Array<{ node: { id: string; name: string } }>;
    };
  }>(`{
    publications(first: 20) {
      edges { node { id name } }
    }
  }`);

  const pubs = result.data?.publications?.edges ?? [];
  for (const { node } of pubs) {
    log.info(`  Publication: ${node.name} (${node.id})`);
  }
  return pubs.map(({ node }) => node.id);
}

/** Publishes a single resource to a publication. */
async function publishResource(
  resourceId: string,
  publicationId: string
): Promise<boolean> {
  // API 2026-01: publishablePublish takes `input: [PublicationInput!]!`
  // (the old scalar `PublishablePublishInput` was removed).
  const result = await adminQuery<{
    publishablePublish: {
      userErrors: UserError[];
    };
  }>(
    `mutation($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        userErrors { field message }
      }
    }`,
    { id: resourceId, input: [{ publicationId }] }
  );

  if (result.errors) {
    log.error(`Publish:${resourceId} — GraphQL: ${JSON.stringify(result.errors)}`);
    return false;
  }

  const { userErrors } = result.data?.publishablePublish ?? {};
  return !hasUserErrors(userErrors, `Publish:${resourceId}`);
}

/** Publishes all products and collections to every sales channel. */
export async function publishAll(
  productIds: Record<string, string>,
  collectionIds: Record<string, string>,
  verbose: boolean
): Promise<void> {
  log.info("Publishing to sales channels…");

  const publicationIds = await getPublicationIds();
  if (publicationIds.length === 0) {
    log.warn("No publications found — skipping publish step");
    return;
  }

  const allResourceIds = [
    ...Object.values(productIds),
    ...Object.values(collectionIds),
  ];

  let published = 0;
  let failed = 0;

  for (const resourceId of allResourceIds) {
    for (const pubId of publicationIds) {
      const ok = await publishResource(resourceId, pubId);
      if (ok) {
        published++;
      } else {
        failed++;
      }
    }
    if (verbose) {
      log.info(`  Published: ${resourceId}`);
    }
  }

  log.info(
    `Published ${published} resource×channel pairs (${failed} failed)`
  );
}
