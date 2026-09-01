"use client";

import type { QueryGlobalSeoSettingsResult } from "@workspace/sanity/types";
import Link from "next/link";

import type { Maybe } from "@/types";
import { SanityImage } from "./elements/sanity-image";

type SettingsLogo = NonNullable<QueryGlobalSeoSettingsResult>["logo"];

type LogoProps = {
  text?: Maybe<string>;
  logo?: Maybe<SettingsLogo>;
};

export function Logo({ text, logo }: LogoProps) {
  // Site chrome, never a heading: as an `h1` it made a category page's outline
  // claim the page was about the store, and promoting it on `/` alone still
  // left two, because the hero that opens the page carries its own.

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
          <span className="whitespace-nowrap text-xl tracking-[1.68px] font-medium uppercase ">
            {text}
          </span>
        )
      )}
    </Link>
  );
}
