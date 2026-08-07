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
          <h1 className="whitespace-nowrap text-xl tracking-[1.68px] font-medium uppercase ">
            {text}
          </h1>
        )
      )}
    </Link>
  );
}
