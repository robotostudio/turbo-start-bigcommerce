"use client";

import { cn } from "@workspace/ui/lib/utils";
import { useEffect, useRef, useState } from "react";

import {
  CheckIcon,
  CopyIcon,
  InstagramIcon,
  LinkedinIcon,
  RedditIcon,
  XIcon,
} from "@/components/icons";

type BlogShareProps = {
  url: string;
  title: string;
};

function openShareWindow(shareUrl: string) {
  window.open(shareUrl, "_blank", "noopener,noreferrer,width=600,height=600");
}

const shareButtonClass =
  "flex flex-col items-center justify-center gap-1 rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

export function BlogShare({ url, title }: BlogShareProps) {
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
      }
    };
  }, []);

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  }

  async function handleCopy() {
    const ok = await copyToClipboard();
    if (!ok) {
      return;
    }
    setCopied(true);
    if (resetTimer.current) {
      clearTimeout(resetTimer.current);
    }
    resetTimer.current = setTimeout(() => setCopied(false), 2000);
  }

  async function shareToInstagram() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Fall through to copy when the share sheet is dismissed/unavailable.
      }
    }
    await copyToClipboard();
  }

  const socialActions = [
    {
      key: "x",
      label: "Post",
      Icon: XIcon,
      onClick: () =>
        openShareWindow(
          `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`
        ),
    },
    {
      key: "instagram",
      label: "Post",
      Icon: InstagramIcon,
      onClick: shareToInstagram,
    },
    {
      key: "linkedin",
      label: "Share",
      Icon: LinkedinIcon,
      onClick: () =>
        openShareWindow(
          `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`
        ),
    },
    {
      key: "reddit",
      label: "Post",
      Icon: RedditIcon,
      onClick: () =>
        openShareWindow(
          `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`
        ),
    },
  ] as const;

  return (
    <div className="flex items-center justify-between border-foreground border-t px-1 pt-4">
      {socialActions.map(({ key, label, Icon, onClick }) => (
        <button
          className={shareButtonClass}
          key={key}
          onClick={onClick}
          type="button"
        >
          <Icon className="size-4.5" />
          <span className="text-xs tracking-[0.02em]">{label}</span>
        </button>
      ))}

      <button
        aria-label={copied ? "Link copied" : "Copy link"}
        className={cn(shareButtonClass, "data-[copied=true]:text-foreground")}
        data-copied={copied}
        onClick={handleCopy}
        type="button"
      >
        {/* Cross-fade the copy/check glyphs in a single grid cell. */}
        <span className="relative grid size-4.5 place-items-center">
          <CopyIcon
            className={cn(
              "col-start-1 row-start-1 size-4.5 transition-[transform,opacity] duration-[250ms] ease-in-out",
              copied ? "scale-50 opacity-0" : "scale-100 opacity-100"
            )}
          />
          <CheckIcon
            className={cn(
              "col-start-1 row-start-1 size-4.5 transition-[transform,opacity] duration-[250ms] ease-in-out",
              copied ? "scale-100 opacity-100" : "scale-50 opacity-0"
            )}
          />
        </span>
        {/* Overlay both labels so the button width stays fixed while it toggles. */}
        <span className="grid text-xs tracking-[0.02em]">
          <span className="invisible col-start-1 row-start-1">Copied</span>
          <span className="col-start-1 row-start-1">
            {copied ? "Copied" : "Copy"}
          </span>
        </span>
      </button>
    </div>
  );
}
