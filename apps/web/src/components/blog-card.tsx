import { Skeleton } from "@workspace/ui/components/skeleton";
import Link from "next/link";

import type { Blog } from "@/types";
import { SanityImage } from "./elements/sanity-image";

type BlogCardProps = {
  blog: Blog;
};

type BlogAuthorProps = {
  author: Blog["authors"];
};

function formatDate(date: string | null) {
  if (!date) return null;
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function BlogAuthor({ author }: BlogAuthorProps) {
  if (!author) {
    return null;
  }

  return (
    <div className="flex items-center gap-x-2 text-muted-foreground text-sm">
      {author.image && (
        <div className="size-6 flex-none overflow-hidden rounded-full bg-muted">
          <SanityImage
            alt={author.name ?? "Author"}
            className="h-full w-full object-cover"
            height={24}
            image={author.image}
            width={24}
          />
        </div>
      )}
      {author.name}
    </div>
  );
}

/** Date + optional category row shown above blog card titles. */
function BlogCardMeta({
  publishedAt,
  category,
}: {
  publishedAt: Blog["publishedAt"];
  category: Blog["category"];
}) {
  if (!(publishedAt || category)) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      {publishedAt && (
        <time className="text-foreground/80" dateTime={publishedAt}>
          {formatDate(publishedAt)}
        </time>
      )}
      {category?.title && (
        <span className="text-muted-foreground">{category.title}</span>
      )}
    </div>
  );
}

export function FeaturedBlogCard({ blog }: BlogCardProps) {
  const { title, publishedAt, slug, description, image, authors, category } =
    blog;

  return (
    <Link
      className="group grid w-full grid-cols-1 items-stretch lg:grid-cols-2"
      href={slug ?? "#"}
    >
      <div className="flex flex-col justify-between gap-8 border border-border p-8">
        <div className="inline-flex w-fit items-center gap-2 rounded border border-border px-3 py-1.5">
          <span className="font-mono text-muted-foreground text-sm uppercase tracking-widest">
            Featured
          </span>
        </div>
        <div className="flex flex-col gap-4">
          <BlogCardMeta category={category} publishedAt={publishedAt} />
          <h2 className="font-medium text-3xl leading-tight tracking-tight">
            {title}
          </h2>
          <p className="text-muted-foreground text-base leading-6">
            {description}
          </p>
          <BlogAuthor author={authors} />
        </div>
      </div>
      {image?.id && (
        <div className="overflow-hidden bg-muted">
          <SanityImage
            alt={title ?? "Blog post image"}
            // Shared card hover language — see collection-card.tsx.
            className="aspect-video h-full w-full object-cover transition-[opacity,scale] duration-160 ease-hover group-hover:scale-102 group-hover:duration-240 motion-reduce:group-hover:scale-100"
            height={450}
            image={image}
            mode="cover"
            width={800}
          />
        </div>
      )}
    </Link>
  );
}

export function BlogCard({ blog }: BlogCardProps) {
  if (!blog) {
    return (
      <div className="flex h-full flex-col gap-4 border border-border p-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="mt-auto h-6 w-24" />
      </div>
    );
  }

  const { title, publishedAt, slug, description, authors, category } = blog;

  return (
    <Link
      className="group flex h-full flex-col gap-4 border border-border p-6 transition-colors hover:border-foreground/30"
      href={slug ?? "#"}
    >
      <BlogCardMeta category={category} publishedAt={publishedAt} />
      <h3 className="font-medium text-xl leading-tight tracking-tight">
        {title}
      </h3>
      <p className="line-clamp-2 text-muted-foreground text-sm leading-6">
        {description}
      </p>
      <div className="mt-auto pt-2">
        <BlogAuthor author={authors} />
      </div>
    </Link>
  );
}

export function BlogHeader({ title }: { title: string | null }) {
  return (
    <div className="flex w-full flex-col gap-4">
      <h1 className="font-medium text-4xl tracking-tight md:text-5xl">
        {title}
      </h1>
    </div>
  );
}
