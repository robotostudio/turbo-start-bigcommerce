"use client";

import { useOptimistic } from "@sanity/visual-editing/react";
import { env } from "@workspace/env/client";
import type { QueryHomePageDataResult } from "@workspace/sanity/types";
import { createDataAttribute } from "next-sanity";
import { Suspense, use, useCallback, useMemo } from "react";

import type { PageBuilderBlockSeed, PageBuilderData } from "./pagebuilder-data";
import { CollectionBanner } from "./sections/collection-banner";
import { CTABlock } from "./sections/cta";
import { EditorialTwoUp } from "./sections/editorial-two-up";
import { ExploreCategories } from "./sections/explore-categories";
import { FaqAccordion } from "./sections/faq-accordion";
import { FaqCategories } from "./sections/faq-categories";
import { FeatureCardsWithIcon } from "./sections/feature-cards-with-icon";
import { FeaturedProducts } from "./sections/featured-products";
import { HeroBlock } from "./sections/hero";
import { ImageLinkCards } from "./sections/image-link-cards";
import { LayersShowcase } from "./sections/layers-showcase";
import { SubscribeNewsletter } from "./sections/subscribe-newsletter";

// More specific and descriptive type aliases
type PageBuilderBlock = NonNullable<
  NonNullable<QueryHomePageDataResult>["pageBuilder"]
>[number];

export type PageBuilderProps = {
  readonly pageBuilder?: PageBuilderBlock[];
  readonly id: string;
  readonly type: string;
  /**
   * Catalog reads the page started server-side, keyed by block `_key` — still
   * pending, and unwrapped per block inside a Suspense boundary below, so the
   * resolve happens at block level rather than in the page.
   *
   * The promises have to be created in the page: this component is
   * `"use client"` because `useOptimistic` powers live editing, and only a
   * server render can start a catalog read. Threading the pending reads down
   * and suspending per block is what lets the product blocks paint real HTML
   * without JavaScript while visual editing keeps working.
   */
  readonly blockData?: PageBuilderData;
};

type SanityDataAttributeConfig = {
  readonly id: string;
  readonly type: string;
  readonly path: string;
};

// biome-ignore lint/suspicious/noExplicitAny: dynamic block component mapping requires any
const BLOCK_COMPONENTS: Record<string, React.ComponentType<any>> = {
  collectionBanner: CollectionBanner,
  cta: CTABlock,
  editorialTwoUp: EditorialTwoUp,
  exploreCategories: ExploreCategories,
  faqAccordion: FaqAccordion,
  faqCategories: FaqCategories,
  featuredProducts: FeaturedProducts,
  hero: HeroBlock,
  featureCardsIcon: FeatureCardsWithIcon,
  layersShowcase: LayersShowcase,
  subscribeNewsletter: SubscribeNewsletter,
  imageLinkCards: ImageLinkCards,
};

/**
 * Helper function to create consistent Sanity data attributes
 */
function createSanityDataAttribute(config: SanityDataAttributeConfig): string {
  return createDataAttribute({
    id: config.id,
    baseUrl: env.NEXT_PUBLIC_SANITY_STUDIO_URL,
    projectId: env.NEXT_PUBLIC_SANITY_PROJECT_ID,
    dataset: env.NEXT_PUBLIC_SANITY_DATASET,
    type: config.type,
    path: config.path,
  }).toString();
}

/**
 * Error fallback component for unknown block types
 */
function UnknownBlockError({
  blockType,
  blockKey,
}: {
  blockType: string;
  blockKey: string;
}) {
  return (
    <div
      aria-label={`Unknown block type: ${blockType}`}
      className="flex items-center justify-center rounded-lg border-2 border-muted-foreground/20 border-dashed bg-muted p-8 text-center text-muted-foreground"
      key={`${blockType}-${blockKey}`}
      role="alert"
    >
      <div className="space-y-2">
        <p>Component not found for block type:</p>
        <code className="rounded bg-background px-2 py-1 font-mono text-sm">
          {blockType}
        </code>
      </div>
    </div>
  );
}

/**
 * Unwraps a block's pending catalog read inside its own Suspense boundary.
 * `use` suspends this subtree — and only it — until the read lands; the
 * boundary's fallback is the same block without a seed, which is exactly its
 * skeleton state. A `null` result is a read that failed: the `seed` prop stays
 * off the block, which falls back to fetching from the browser as before.
 */
function SeededBlock({
  block,
  component: Component,
  seedPromise,
}: {
  block: PageBuilderBlock;
  // biome-ignore lint/suspicious/noExplicitAny: dynamic block component mapping requires any
  component: React.ComponentType<any>;
  seedPromise: Promise<PageBuilderBlockSeed | null>;
}) {
  const seed = use(seedPromise);
  // biome-ignore lint/suspicious/noExplicitAny: dynamic block component mapping requires any
  return <Component {...(block as any)} {...(seed ? { seed } : {})} />;
}

/**
 * Hook to handle optimistic updates for page builder blocks
 */
function useOptimisticPageBuilder(
  initialBlocks: PageBuilderBlock[],
  documentId: string
) {
  // biome-ignore lint/suspicious/noExplicitAny: <any is used to allow for dynamic component rendering>
  return useOptimistic<PageBuilderBlock[], any>(
    initialBlocks,
    (currentBlocks, action) => {
      if (action.id === documentId && action.document?.pageBuilder) {
        return action.document.pageBuilder;
      }
      return currentBlocks;
    }
  );
}

/**
 * Custom hook for block component rendering logic
 */
function useBlockRenderer(
  id: string,
  type: string,
  blockData: PageBuilderData | undefined
) {
  const createBlockDataAttribute = useCallback(
    (blockKey: string) =>
      createSanityDataAttribute({
        id,
        type,
        path: `pageBuilder[_key=="${blockKey}"]`,
      }),
    [id, type]
  );

  const renderBlock = useCallback(
    (block: PageBuilderBlock, _index: number) => {
      const Component =
        BLOCK_COMPONENTS[block._type as keyof typeof BLOCK_COMPONENTS];

      if (!Component) {
        return (
          <UnknownBlockError
            blockKey={block._key}
            blockType={block._type}
            key={`${block._type}-${block._key}`}
          />
        );
      }

      // Absent for every block type that needs no catalog read. An optimistic
      // edit in the Studio can also mint a block whose `_key` was never read,
      // which lands here the same way: no pending read, plain client fetch.
      const seedPromise = blockData?.[block._key];

      return (
        <div
          data-sanity={createBlockDataAttribute(block._key)}
          key={`${block._type}-${block._key}`}
        >
          {seedPromise ? (
            <Suspense
              fallback={
                /** biome-ignore lint/suspicious/noExplicitAny: <any is used to allow for dynamic component rendering> */
                <Component {...(block as any)} />
              }
            >
              <SeededBlock
                block={block}
                component={Component}
                seedPromise={seedPromise}
              />
            </Suspense>
          ) : (
            /** biome-ignore lint/suspicious/noExplicitAny: <any is used to allow for dynamic component rendering> */
            <Component {...(block as any)} />
          )}
        </div>
      );
    },
    [createBlockDataAttribute, blockData]
  );

  return { renderBlock };
}

/**
 * PageBuilder component for rendering dynamic content blocks from Sanity CMS
 */
export function PageBuilder({
  pageBuilder: initialBlocks = [],
  id,
  type,
  blockData,
}: PageBuilderProps) {
  const blocks = useOptimisticPageBuilder(initialBlocks, id);
  const { renderBlock } = useBlockRenderer(id, type, blockData);

  const containerDataAttribute = useMemo(
    () => createSanityDataAttribute({ id, type, path: "pageBuilder" }),
    [id, type]
  );

  if (!blocks.length) {
    return null;
  }

  return (
    <main className="flex flex-col" data-sanity={containerDataAttribute}>
      {blocks.map(renderBlock)}
    </main>
  );
}
