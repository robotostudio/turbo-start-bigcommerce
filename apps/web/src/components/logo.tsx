"use client";

import type { QueryGlobalSeoSettingsResult } from "@workspace/sanity/types";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Maybe } from "@/types";
import { SanityImage } from "./elements/sanity-image";

type SettingsLogo = NonNullable<QueryGlobalSeoSettingsResult>["logo"];

type LogoProps = {
  text?: Maybe<string>;
  logo?: Maybe<SettingsLogo>;
};

export function Logo({ text, logo }: LogoProps) {
  // The store name is the heading of the home page and site chrome everywhere
  // else. Rendered as `h1` unconditionally it gave every page two of them, with
  // the store's name first — so a category page's outline claimed the page was
  // about the store rather than about jackets.
  const isHome = usePathname() === "/";
  const NameTag = isHome ? "h1" : "span";

  return (
    <Link className="flex gap-2 items-center" href="/">
      {logo?.id ? (
        <SanityImage
          className="h-full w-auto object-contain dark:invert"
          height={80}
          image={logo}
          loading="eager"
          width={160}
        />
      ) : (
        text && (
          <NameTag className="whitespace-nowrap text-xl tracking-[1.68px] font-medium uppercase ">
            {text}
          </NameTag>
        )
      )}
    </Link>
  );
}
