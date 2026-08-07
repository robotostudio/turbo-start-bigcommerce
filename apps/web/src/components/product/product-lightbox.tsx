"use client";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { cn } from "@workspace/ui/lib/utils";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { shopifyFullscreenURL } from "@/lib/shopify/image-loader";
import type { ShopifyImage } from "@/lib/shopify/types";

type ProductLightboxProps = {
  images: ShopifyImage[];
  index: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (index: number) => void;
  /** Source rect captured when the lightbox was opened (for the open FLIP). */
  sourceRect: DOMRect | null;
  /** Resolves the current on-page source rect (for the close FLIP). */
  getSourceRect: (index: number) => DOMRect | null;
  /**
   * The optimized URL the on-page `next/image` had already downloaded when the
   * lightbox was opened, so the fullscreen `<img>` reuses that cached resource
   * (instant, no new fetch). Tagged with its index; `null` when unavailable.
   */
  sourceSrc: { index: number; src: string } | null;
  /**
   * Resolves that same URL live, for images reached by arrow navigation rather
   * than by the click that opened the lightbox.
   */
  getSourceSrc: (index: number) => string | null;
};

/** In-lightbox zoom factor (click to magnify). */
const SCALE = 3;
const DRAG_THRESHOLD = 6;
/** Open/close FLIP timing. */
const FLIP_MS = 340;
/** Mirrors `--ease-panel` in globals.css — WAAPI `easing` does not resolve var(). */
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
/** Reduced-motion fade; 340ms of pure fade with no movement reads sluggish. */
const REDUCED_FADE_MS = 200;

/* size-11 is 44px — already a full tap target, so only press feedback is added.
 * 0.94 on a 44px circle is ~2.6px of edge travel. No hover scale: the
 * background change already carries it, and motion is a spice. */
const roundControl =
  "absolute z-10 flex size-11 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm backdrop-blur-sm transition-[background-color,transform] duration-150 ease-out-quint hover:bg-background active:scale-[0.94]";

/** Transform that maps the fullscreen image box onto the on-page source rect. */
function flipTransform(src: DOMRect, dst: DOMRect) {
  return `translate(${src.left - dst.left}px, ${src.top - dst.top}px) scale(${src.width / dst.width}, ${src.height / dst.height})`;
}

/**
 * With no FLIP under reduced motion, the image fades with the backdrop rather
 * than hard-cutting onto an empty canvas. Empty string when motion is allowed —
 * the FLIP handles the entrance there.
 */
function reducedFadeClass(reduced: boolean, active: boolean) {
  if (!reduced) return "";
  return active
    ? "opacity-100 transition-opacity"
    : "opacity-0 transition-opacity";
}

/**
 * A copy of the outgoing image, layered over the incoming one during arrow
 * navigation. Because the gallery is uniformly 3:4 the two are pixel-congruent,
 * so fading this out IS the crossfade — the incoming image needs no enter
 * animation and therefore never perturbs the close FLIP's measurement.
 *
 * It holds at full opacity until `ready`, so the crossfade can never resolve
 * onto a blank box, then plays one exit and removes itself. 8px of travel
 * against the direction of movement, so 200ms rather than the FLIP's 340ms.
 *
 * `ready` is latched rather than tracked: the shared flag can go true → false →
 * true across a fast navigation, and taking the animation class back off
 * mid-flight cancels it (so `animationend` never fires) and snaps the ghost
 * back to full opacity over the new image. Once armed, stay armed.
 */
function NavGhost({
  src,
  dir,
  ready,
  onDone,
}: {
  src: string;
  dir: -1 | 1;
  ready: boolean;
  onDone: () => void;
}) {
  const [armed, setArmed] = useState(ready);
  useEffect(() => {
    if (ready) setArmed(true);
  }, [ready]);

  const exit = armed
    ? cn(
        "fade-out-0 animate-out fill-mode-forwards duration-200 ease-out-quint",
        dir === 1 ? "slide-out-to-left-2" : "slide-out-to-right-2"
      )
    : "";

  return (
    // biome-ignore lint/performance/noImgElement: transient crossfade layer, not a layout image
    <img
      alt=""
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute block max-h-[calc(100vh-4rem)] w-auto max-w-[92vw] select-none object-contain",
        exit
      )}
      draggable={false}
      onAnimationEnd={onDone}
      src={src}
    />
  );
}

export function ProductLightbox({
  images,
  index,
  open,
  onOpenChange,
  onIndexChange,
  sourceRect,
  sourceSrc,
  getSourceRect,
  getSourceSrc,
}: ProductLightboxProps) {
  const [zoomed, setZoomed] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [active, setActive] = useState(false); // backdrop + controls visible
  const reduced = usePrefersReducedMotion();

  // Outgoing copies of the previous image, one per arrow press, each playing a
  // single exit before removing itself. Deliberately NOT a transition on one
  // persistent node: mashing the arrows stacks independent ghosts instead of
  // restarting a shared keyframe from zero.
  const [ghosts, setGhosts] = useState<
    { id: number; src: string; dir: -1 | 1 }[]
  >([]);
  const ghostId = useRef(0);
  // Whether the incoming image has decoded. Until it has, the ghost holds at
  // full opacity so a crossfade never resolves onto a blank box.
  const [incomingReady, setIncomingReady] = useState(true);

  const imgRef = useRef<HTMLImageElement>(null);
  const fit = useRef({ w: 0, h: 0 });
  const drag = useRef({
    active: false,
    sx: 0,
    sy: 0,
    px: 0,
    py: 0,
    moved: false,
  });
  const closing = useRef(false);
  const openedFlip = useRef(false);

  const current = images[index];
  const [displaySrc, setDisplaySrc] = useState<string | undefined>(undefined);
  const fadeMs = reduced ? REDUCED_FADE_MS : FLIP_MS;

  // Reuse the exact optimized URL the on-page gallery already downloaded so the
  // fullscreen image is an instant cache hit with no new fetch.
  //
  // This must be an effect, not a render-phase expression. Reading `currentSrc`
  // off the on-page <img> during render is impure, and the React Compiler
  // memoizes it on deps that never change between mount and open (`images`,
  // `index`, and the stable parent callbacks — not `open`). That froze the
  // value to the mount-time result, when the gallery's refs were still empty,
  // so every first open fetched the multi-MB Shopify master instead.
  //
  // Falls back to a bounded transform only when the image isn't loaded on-page
  // (e.g. an arrow-navigated image that was still lazy) — never the master.
  useLayoutEffect(() => {
    if (!(open && current)) return;
    const cached =
      sourceSrc?.index === index ? sourceSrc.src : getSourceSrc(index);
    setDisplaySrc(cached ?? shopifyFullscreenURL(current.url));
  }, [open, index, current, sourceSrc, getSourceSrc]);

  // Hold the outgoing ghost at full opacity until the incoming image has
  // decoded. Only touches state — never reads or writes a transform — so it
  // cannot perturb `runOpenFlip` or `requestClose`.
  // biome-ignore lint/correctness/useExhaustiveDependencies: displaySrc is the <img>'s src — it is what makes this re-run per image, even though it isn't read in the body
  useLayoutEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    if (img.complete && img.naturalWidth > 0) {
      setIncomingReady(true);
      return;
    }
    setIncomingReady(false);
    const done = () => setIncomingReady(true);
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
    // Failsafe: a ghost must never be stranded at opacity 1.
    const timer = window.setTimeout(done, 600);
    return () => {
      img.removeEventListener("load", done);
      img.removeEventListener("error", done);
      window.clearTimeout(timer);
    };
  }, [displaySrc]);

  // Warm the neighbours so arrow nav is almost always an instant swap. Both
  // `open` and `index` genuinely change, so this is not exposed to the
  // memoization trap described above.
  useEffect(() => {
    if (!(open && images.length > 1)) return;
    for (const dir of [-1, 1] as const) {
      const i = (index + dir + images.length) % images.length;
      const target = images[i];
      if (!target) continue;
      const pre = new window.Image();
      pre.src = getSourceSrc(i) ?? shopifyFullscreenURL(target.url);
    }
  }, [open, index, images, getSourceSrc]);

  // Zoom the image out of its on-page source. Runs once the lightbox image has
  // laid out — frame 1, since the <img> carries intrinsic width/height so its
  // box is measurable before the resource arrives; the poll below is a safety
  // net for images whose dimensions are missing.
  const runOpenFlip = () => {
    if (!open || openedFlip.current) return;
    // Reduced motion: skip the zoom entirely and let the backdrop fade carry
    // the transition. Marking it done also stops the 1s poll on frame 1.
    if (reduced) {
      openedFlip.current = true;
      return;
    }
    const img = imgRef.current;
    const src = sourceRect;
    if (!img || !src) return;
    const dst = img.getBoundingClientRect();
    if (dst.width < 1 || dst.height < 1) return;
    openedFlip.current = true;
    img.animate(
      [
        { transformOrigin: "top left", transform: flipTransform(src, dst) },
        { transformOrigin: "top left", transform: "none" },
      ],
      { duration: FLIP_MS, easing: EASE }
    );
  };

  // Arm the open animation and fade the backdrop in. Poll for a few frames
  // because a remote <img> reports its size a little after mount (before it is
  // fully `complete`), and the FLIP needs a measurable box.
  // biome-ignore lint/correctness/useExhaustiveDependencies: arm on open only
  useLayoutEffect(() => {
    if (!open) {
      setActive(false);
      openedFlip.current = false;
      // Don't leave a ghost stranded for the next open.
      setGhosts([]);
      return;
    }
    closing.current = false;
    openedFlip.current = false;

    const fadeRaf = requestAnimationFrame(() => setActive(true));
    const deadline = performance.now() + 1000;
    let pollRaf = 0;
    const poll = () => {
      runOpenFlip();
      if (!openedFlip.current && performance.now() < deadline) {
        pollRaf = requestAnimationFrame(poll);
      }
    };
    pollRaf = requestAnimationFrame(poll);

    return () => {
      cancelAnimationFrame(fadeRaf);
      cancelAnimationFrame(pollRaf);
    };
  }, [open]);

  const resetZoom = () => {
    setZoomed(false);
    setPan({ x: 0, y: 0 });
    setPanning(false);
  };

  // Close: zoom the image back into the current source, then actually close.
  const requestClose = () => {
    if (closing.current) return;
    closing.current = true;
    setActive(false);

    const img = imgRef.current;
    const src = getSourceRect(index);
    const finish = () => onOpenChange(false);

    if (img && src && !reduced) {
      // Measure the fitted (untransformed) rect even if currently zoomed.
      const prev = img.style.transform;
      img.style.transform = "none";
      const dst = img.getBoundingClientRect();
      img.style.transform = prev;

      resetZoom();
      if (dst.width > 0) {
        const anim = img.animate(
          [
            { transformOrigin: "top left", transform: "none" },
            { transformOrigin: "top left", transform: flipTransform(src, dst) },
          ],
          { duration: FLIP_MS, easing: EASE, fill: "forwards" }
        );
        anim.onfinish = finish;
        anim.oncancel = finish;
        return;
      }
    }
    resetZoom();
    window.setTimeout(finish, reduced ? REDUCED_FADE_MS : FLIP_MS);
  };

  const handleOpenChange = (next: boolean) => {
    if (next) {
      onOpenChange(true);
      return;
    }
    requestClose(); // ESC / interact-outside → animate, then close
  };

  const go = (dir: -1 | 1) => {
    // Capture the outgoing URL here, in the event handler — an event-handler
    // read of state, which the React Compiler never memoizes, so this stays
    // clear of the trap documented above.
    if (displaySrc) {
      ghostId.current += 1;
      setGhosts((g) => [...g, { id: ghostId.current, src: displaySrc, dir }]);
    }
    resetZoom();
    onIndexChange((index + dir + images.length) % images.length);
  };

  const clampPan = (x: number, y: number) => {
    const maxX = (fit.current.w / 2) * (SCALE - 1);
    const maxY = (fit.current.h / 2) * (SCALE - 1);
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    drag.current = {
      active: true,
      sx: e.clientX,
      sy: e.clientY,
      px: pan.x,
      py: pan.y,
      moved: false,
    };
    if (zoomed) {
      setPanning(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.sx;
    const dy = e.clientY - drag.current.sy;
    if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) drag.current.moved = true;
    if (zoomed) setPan(clampPan(drag.current.px + dx, drag.current.py + dy));
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const wasDrag = drag.current.moved;
    drag.current.active = false;
    setPanning(false);
    if (wasDrag) return;

    if (zoomed) {
      resetZoom();
      return;
    }
    const rect = imgRef.current?.getBoundingClientRect();
    if (!rect) {
      setZoomed(true);
      return;
    }
    fit.current = { w: rect.width, h: rect.height };
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    setPan(clampPan(dx * (1 - SCALE), dy * (1 - SCALE)));
    setZoomed(true);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (images.length < 2) return;
    if (e.key === "ArrowLeft") go(-1);
    if (e.key === "ArrowRight") go(1);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent
        className="gap-0 bg-transparent duration-0"
        onKeyDown={onKeyDown}
        overlayClassName="bg-transparent"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Product image viewer</DialogTitle>

        {/* Backdrop — fades in/out independently of the zooming image.
         * Carries the gallery's `card-surface` gradient so the surface behind a
         * transparent product doesn't jump from gradient to flat as the FLIP
         * lifts the image off its card. `bg-background` stays as the opaque base
         * layer under the gradient — the utility only sets background-image. */}
        <button
          aria-label="Close"
          className={cn(
            "card-surface absolute inset-0 bg-background transition-opacity",
            active ? "opacity-100" : "opacity-0"
          )}
          onClick={requestClose}
          style={{ transitionDuration: `${fadeMs}ms` }}
          type="button"
        />

        {/* Zoomable image — click to magnify ~3x at the point, drag to pan.
         * With no FLIP under reduced motion, the image fades with the backdrop
         * rather than hard-cutting onto an empty canvas. */}
        <div
          className={cn(
            "pointer-events-none relative flex flex-1 items-center justify-center overflow-hidden p-4 md:p-8",
            reducedFadeClass(reduced, active)
          )}
          style={{ transitionDuration: `${fadeMs}ms` }}
        >
          {current && (
            <button
              aria-label={zoomed ? "Zoom out" : "Zoom in"}
              className={cn(
                "pointer-events-auto block touch-none",
                zoomed
                  ? panning
                    ? "cursor-grabbing"
                    : "cursor-grab"
                  : "cursor-zoom-in"
              )}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              type="button"
            >
              {/* biome-ignore lint/performance/noImgElement: interactive zoom target, not a layout image */}
              <img
                alt={current.altText ?? "Product image"}
                className="block max-h-[calc(100vh-4rem)] w-auto max-w-[92vw] select-none object-contain"
                draggable={false}
                fetchPriority="high"
                height={current.height}
                ref={imgRef}
                src={displaySrc}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomed ? SCALE : 1})`,
                  transformOrigin: "center center",
                  // A 3x scale is the biggest movement here; direct-manipulation
                  // zoom should land instantly under reduced motion.
                  transition:
                    panning || reduced ? "none" : "transform 200ms ease",
                }}
                width={current.width}
              />
            </button>
          )}

          {ghosts.map((ghost) => (
            <NavGhost
              dir={ghost.dir}
              key={ghost.id}
              onDone={() =>
                setGhosts((g) => g.filter((x) => x.id !== ghost.id))
              }
              ready={incomingReady}
              src={ghost.src}
            />
          ))}
        </div>

        {/* Controls — fade with the backdrop */}
        <div
          className={cn(
            "transition-opacity",
            active ? "opacity-100" : "opacity-0"
          )}
          style={{ transitionDuration: `${fadeMs}ms` }}
        >
          <button
            aria-label="Close"
            className={cn(roundControl, "top-4 right-4")}
            onClick={requestClose}
            type="button"
          >
            <X className="size-5" />
          </button>

          {images.length > 1 && (
            <>
              <button
                aria-label="Previous image"
                className={cn(roundControl, "top-1/2 left-4 -translate-y-1/2")}
                onClick={() => go(-1)}
                type="button"
              >
                <ArrowLeft className="size-5" />
              </button>
              <button
                aria-label="Next image"
                className={cn(roundControl, "top-1/2 right-4 -translate-y-1/2")}
                onClick={() => go(1)}
                type="button"
              >
                <ArrowRight className="size-5" />
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
