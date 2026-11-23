import { describe, expect, it } from "vitest";

import { galleryScrollIndex } from "../product-gallery";

const IMAGES = [{ url: "indigo-1" }, { url: "indigo-2" }, { url: "stone-1" }];

describe("galleryScrollIndex", () => {
  it("scrolls on the first render when the page opens on another colour", () => {
    expect(galleryScrollIndex(IMAGES, "stone-1", null)).toBe(2);
  });

  it("stays put on the first render when the colour's photo is already first", () => {
    expect(galleryScrollIndex(IMAGES, "indigo-1", null)).toBeNull();
  });

  it("scrolls when the chosen colour changes, back to the first photo too", () => {
    expect(galleryScrollIndex(IMAGES, "stone-1", "indigo-1")).toBe(2);
    expect(galleryScrollIndex(IMAGES, "indigo-1", "stone-1")).toBe(0);
  });

  it("does nothing when the photo has not changed or is not in the gallery", () => {
    expect(galleryScrollIndex(IMAGES, "stone-1", "stone-1")).toBeNull();
    expect(galleryScrollIndex(IMAGES, "elsewhere", "indigo-1")).toBeNull();
    expect(galleryScrollIndex(IMAGES, undefined, "indigo-1")).toBeNull();
  });
});
