"use client";

import { useOptimistic } from "@sanity/visual-editing/react";
import { env } from "@workspace/env/client";
import { createDataAttribute } from "next-sanity";
import { useCallback, useMemo } from "react";

import type { PageBuilderData } from "./pagebuilder-data";
import {
  applyOptimisticPageBuilder,
  type OptimisticDocument,
  type PageBuilderBlock,
} from "./pagebuilder-reducer";
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

export type PageBuilderProps = {
  // GROQ projects an unset array as `null`, so callers pass it through unguarded.
  readonly pageBuilder?: PageBuilderBlock[] | null;
  readonly id: string;
  readonly type: string;
  /**
   * Catalog data the page already resolved server-side, keyed by block `_key`.
   *
   * Resolved values, not promises. This component is `"use client"` because
   * `useOptimistic` powers live editing, and a promise handed across the RSC
   * boundary is rebuilt from the flight stream unsettled — so `use()` on it
   * suspends, the block's skeletons go into the shell, and the real markup is
   * parked in a trailing `<div hidden>` that only JavaScript swaps in. The
   * reads still have to start in the page, since only a server render can make
   * them; they now finish there too.
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
 * Hook to handle optimistic updates for page builder blocks
 */
function useOptimisticPageBuilder(
  initialBlocks: PageBuilderBlock[],
  documentId: string
) {
  return useOptimistic<PageBuilderBlock[], OptimisticDocument>(
    initialBlocks,
    (currentBlocks, action) =>
      applyOptimisticPageBuilder(currentBlocks, action, documentId)
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

      // Absent for every block type that needs no catalog read, and `null` for
      // a read that failed — both leave the `seed` prop off, which is the
      // block's own signal to fetch from the browser instead. An optimistic
      // edit in the Studio can also mint a block whose `_key` was never read,
      // which lands here the same way.
      const seed = blockData?.[block._key];

      return (
        <div
          data-sanity={createBlockDataAttribute(block._key)}
          key={`${block._type}-${block._key}`}
        >
          {/** biome-ignore lint/suspicious/noExplicitAny: <any is used to allow for dynamic component rendering> */}
          <Component {...(block as any)} {...(seed ? { seed } : {})} />
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
  pageBuilder: initialBlocks,
  id,
  type,
  blockData,
}: PageBuilderProps) {
  const blocks = useOptimisticPageBuilder(initialBlocks ?? [], id);
  const { renderBlock } = useBlockRenderer(id, type, blockData);

  const containerDataAttribute = useMemo(
    () => createSanityDataAttribute({ id, type, path: "pageBuilder" }),
    [id, type]
  );

  // A `div`, not a `main`: every route here owns its own `main`, and nesting is
  // invalid. Rendered even when empty, or an editor who deleted the last block
  // has no `pageBuilder` drop target left.
  return (
    <div className="flex flex-col" data-sanity={containerDataAttribute}>
      {blocks.map(renderBlock)}
    </div>
  );
}
