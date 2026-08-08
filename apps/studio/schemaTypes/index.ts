import { syncSchemaTypes } from "@workspace/sanity-sync/schema";

import { pageBuilderBlocks } from "@/schemaTypes/blocks";
import { definitions } from "@/schemaTypes/definitions";
import { documents, singletons } from "@/schemaTypes/documents";
import { annotations, objects } from "@/schemaTypes/objects";
import { withStoreThumbnails } from "@/schemaTypes/synced-previews";

// The sync package built these "exported, deliberately NOT registered" and
// called registration the flip that turns the sync on. This is the flip
// (ROB-2543, revised): page-builder blocks reference the synced documents
// instead of holding denormalised stubs, and the Studio never calls
// BigCommerce itself.
export const schemaTypes = [
  ...documents,
  ...withStoreThumbnails(syncSchemaTypes),
  ...objects,
  ...annotations,
  ...definitions,
  ...pageBuilderBlocks,
];

export const schemaNames = [...documents].map((doc) => doc.name);
export type SchemaType = (typeof schemaNames)[number];

export const singletonType = singletons.map(({ name }) => name);
export type SingletonType = (typeof singletonType)[number];

export default schemaTypes;
