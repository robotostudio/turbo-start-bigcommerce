"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { StoreImage } from "@/components/product/store-image";
import { dropdownHandlers } from "./dropdown-handlers";

type CollectionLink = {
  _id: string;
  slug: string | null;
  store: {
    title: string | null;
    imageUrl: string | null;
  } | null;
};

type CollectionGroupDropdownProps = {
  _key: string;
  title: string | null;
  collectionLinks: CollectionLink[] | null;
  collectionProducts: {
    _id: string;
    slug: string | null;
    store: { title: string | null } | null;
  } | null;
};

export function CollectionGroupDropdown({
  title,
  collectionLinks,
  collectionProducts,
}: CollectionGroupDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="group relative" {...dropdownHandlers(isOpen, setIsOpen)}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="flex items-center gap-1 px-3 py-2 font-medium text-muted-foreground text-sm transition-colors hover:text-foreground"
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        {title}
        <ChevronDown className="size-3 transition-transform group-hover:rotate-180" />
      </button>
      {/* `hidden`, not conditional mounting: mounting on open kept these links
       * out of the server HTML entirely. `hidden` still drops them from the
       * tab order while closed. */}
      <div
        className="fade-in-0 zoom-in-95 absolute top-full left-0 z-50 min-w-80 animate-in rounded-lg border bg-popover p-4 shadow-lg"
        hidden={!isOpen}
        role="menu"
      >
        <div className="grid gap-3">
          {collectionLinks?.map((collection) => {
            if (!collection.slug) return null;
            return (
              <Link
                className="flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-accent"
                href={`/collections/${collection.slug}`}
                key={collection._id}
              >
                {collection.store?.imageUrl && (
                  <div className="relative size-10 shrink-0 overflow-hidden rounded-md bg-muted">
                    <StoreImage
                      alt={collection.store.title ?? ""}
                      className="object-cover"
                      fill
                      sizes="40px"
                      src={collection.store.imageUrl}
                    />
                  </div>
                )}
                <span className="font-medium text-sm">
                  {collection.store?.title}
                </span>
              </Link>
            );
          })}
        </div>

        {collectionProducts?.slug && (
          <div className="mt-3 border-t pt-3">
            <Link
              className="text-muted-foreground text-sm transition-colors hover:text-foreground"
              href={`/collections/${collectionProducts.slug}`}
            >
              View all {collectionProducts.store?.title}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
