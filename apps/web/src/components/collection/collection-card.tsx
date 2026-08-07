import Link from "next/link";

import { ShopifyImage as Image } from "@/components/product/shopify-image";

export type CollectionCardProps = {
  handle: string;
  title: string;
  imageUrl: string | null;
  /** Forwarded to `next/link`: replace the current history entry, don't push. */
  replace?: boolean;
};

export function CollectionCard({
  handle,
  title,
  imageUrl,
  replace,
}: CollectionCardProps) {
  return (
    <Link
      className="group block overflow-hidden"
      href={`/collections/${handle}`}
      replace={replace}
    >
      <div className="card-surface relative aspect-56/75 overflow-hidden">
        {imageUrl ? (
          <Image
            alt={title}
            // Shared card hover language — same string in product-card,
            // editorial-two-up and blog-card. Under reduced motion this
            // collapses to no motion at all, which is correct: unlike the
            // product card's crossfade it carries no information, and the
            // "View Collection" bar still provides the hover affordance.
            className="object-cover transition-[opacity,scale] duration-160 ease-hover group-hover:scale-102 group-hover:duration-240 motion-reduce:group-hover:scale-100"
            fill
            sizes="(min-width: 768px) 33vw, 50vw"
            src={imageUrl}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            No image
          </div>
        )}

        {/* "View Collection" bar — mirrors the product card's add-to-cart bar,
         * including `hidden md:flex`: the reveal is md:- and pointer-gated, so
         * below md it can never show, and leaving it displayed put an
         * invisible strip over the bottom of the image. */}
        <div className="pointer-events-none absolute inset-x-2 bottom-2 z-10 hidden items-center justify-center bg-background p-2 opacity-0 transition-opacity duration-140 ease-hover md:flex md:group-hover:pointer-events-auto md:group-hover:opacity-100 md:group-hover:duration-200">
          <span className="font-medium text-foreground text-sm">
            View Collection
          </span>
        </div>
      </div>
      <div className="px-1 pt-2">
        <h2 className="font-medium text-base text-foreground">{title}</h2>
      </div>
    </Link>
  );
}
