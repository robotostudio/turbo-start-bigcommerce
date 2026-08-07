"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { ColumnLink, NavColumn, NavigationData } from "@/types";
import { CartDrawer } from "./cart/cart-drawer";
import { CartToggle } from "./cart/cart-toggle";
import { MenuLink } from "./elements/menu-link";
import { Logo } from "./logo";
import { MobileMenu } from "./mobile-menu";
import { CollectionGroupDropdown } from "./nav/collection-group-dropdown";
import { SavedItemsDrawer } from "./saved-items/saved-items-drawer";
import { SavedItemsToggle } from "./saved-items/saved-items-toggle";
import { SearchToggle } from "./search/search-toggle";

function DesktopColumnDropdown({
  column,
}: {
  column: Extract<NavColumn, { type: "column" }>;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const handleMouseEnter = () => {
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    setIsOpen(false);
  };

  return (
    <div className="group relative">
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="flex items-center gap-1 py-2 font-medium text-sm tracking-[0.02em] transition-colors hover:text-foreground"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        type="button"
      >
        {column.title}
        <ChevronDown className="size-3 transition-transform group-hover:rotate-180" />
      </button>
      {isOpen ? (
        <div
          className="fade-in-0 zoom-in-95 absolute top-full left-0 z-50 min-w-70 animate-in rounded-lg border bg-popover p-2 shadow-lg"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          role="menu"
        >
          <div className="grid gap-1">
            {column.links?.map((link: ColumnLink) => (
              <MenuLink
                description={link.description || ""}
                href={link.href || ""}
                icon={link.icon}
                key={link._key}
                name={link.name || ""}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DesktopColumnLink({
  column,
}: {
  column: Extract<NavColumn, { type: "link" }>;
}) {
  if (!column.href) return null;

  return (
    <Link
      className="py-2 font-medium text-sm tracking-[0.02em] transition-colors hover:text-foreground"
      href={column.href}
    >
      {column.name}
    </Link>
  );
}

export function Navbar({ navbarData, settingsData }: NavigationData) {
  const { columns } = navbarData || {};
  const { siteTitle, logo } = settingsData || {};

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-white dark:bg-black">
      <div className="site-container">
        <div className="flex h-10 items-center justify-between">
          {/* Desktop Navigation */}
          <nav className="hidden flex-1 items-center gap-6 lg:flex">
            {columns?.map((column) => {
              if (column.type === "column") {
                return (
                  <DesktopColumnDropdown column={column} key={column._key} />
                );
              }
              if (column.type === "link") {
                return <DesktopColumnLink column={column} key={column._key} />;
              }
              if (column.type === "collectionGroup") {
                const cg = column as Extract<
                  NavColumn,
                  { type: "collectionGroup" }
                >;
                return (
                  <CollectionGroupDropdown
                    _key={cg._key}
                    collectionLinks={cg.collectionLinks ?? null}
                    collectionProducts={cg.collectionProducts ?? null}
                    key={cg._key}
                    title={cg.title ?? null}
                  />
                );
              }
              return null;
            })}
          </nav>

          {/* Logo */}
          <div className="flex h-10 items-center">
            <Logo logo={logo} text={siteTitle} />
          </div>

          {/* Desktop Actions */}
          <div className="hidden flex-1 items-center justify-end gap-6 lg:flex">
            <SavedItemsToggle variant="text" />
            <SearchToggle />
            <CartToggle />
          </div>

          {/* Mobile Actions */}
          <div className="flex items-center gap-4 lg:hidden">
            <SearchToggle />
            <SavedItemsToggle />
            <CartToggle />
            <MobileMenu navbarData={navbarData} settingsData={settingsData} />
          </div>
        </div>
      </div>

      <CartDrawer />
      <SavedItemsDrawer />
    </header>
  );
}
