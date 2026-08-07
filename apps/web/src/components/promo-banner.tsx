"use client";

import type { QueryPromoBannerDataResult } from "@workspace/sanity/types";
import Link from "next/link";

type PromoBannerProps = {
  data: QueryPromoBannerDataResult;
};

export function PromoBanner({ data }: PromoBannerProps) {
  if (!data?.enabled || !data.text) return null;

  const text = data.text;

  return (
    <div className="w-full bg-black px-2.5 py-1 text-center dark:bg-white">
      {data.href ? (
        <Link
          className="text-sm text-zinc-300 tracking-widest uppercase hover:text-zinc-100 dark:text-zinc-700 dark:hover:text-zinc-900"
          href={data.href}
        >
          {text}
        </Link>
      ) : (
        <p className="text-sm text-zinc-300 tracking-widest uppercase dark:text-zinc-700">
          {text}
        </p>
      )}
    </div>
  );
}
