import { describe, expect, it } from "vitest";

import {
  applyOptimisticPageBuilder,
  type PageBuilderBlock,
} from "../pagebuilder-reducer";

/**
 * Returning the raw action document wholesale stripped every GROQ-derived
 * field, so a shift-drag in Presentation broke every image, video and
 * reference-driven section until a refresh.
 */

const DOC = "homePage";

const RESOLVED = [
  { _key: "a", _type: "hero", image: { url: "a.jpg" } },
  { _key: "b", _type: "faqAccordion", faqs: [{ _id: "f1" }] },
  { _key: "c", _type: "cta" },
] as unknown as PageBuilderBlock[];

const [heroBlock, faqBlock, ctaBlock] = RESOLVED;

/** The unprojected fields are the point: none may leak into the result. */
const raw = (...keys: string[]) => ({
  id: DOC,
  document: {
    pageBuilder: keys.map((_key) => ({
      _key,
      image: { asset: { _ref: "image-abc" } },
      faqs: [{ _ref: "faq-abc" }],
    })),
  },
});

const apply = (action: Parameters<typeof applyOptimisticPageBuilder>[1]) =>
  applyOptimisticPageBuilder(RESOLVED, action, DOC);

describe("page builder optimistic reducer", () => {
  it("reorders without swapping resolved blocks for raw ones", () => {
    expect(apply(raw("c", "a", "b"))).toEqual([ctaBlock, heroBlock, faqBlock]);
  });

  it("drops a just-inserted block rather than rendering it unresolved", () => {
    expect(apply(raw("a", "new", "b", "c"))).toEqual(RESOLVED);
  });

  it("removes a deleted block", () => {
    expect(apply(raw("a", "c"))).toEqual([heroBlock, ctaBlock]);
  });

  it("empties the page when Sanity unsets the array", () => {
    expect(apply({ id: DOC, document: {} })).toEqual([]);
  });

  it("keeps the current blocks when the action says nothing usable", () => {
    // Same order — an unrelated field edit replaying through the reducer.
    expect(apply(raw("a", "b", "c"))).toBe(RESOLVED);
    expect(apply({ id: "other", document: { pageBuilder: [] } })).toBe(
      RESOLVED
    );
    // Malformed: a truthy non-array would throw out of `for...of` mid-render.
    expect(apply({ id: DOC, document: { pageBuilder: {} } })).toBe(RESOLVED);
    // Every key new at once: the whole array was replaced, not emptied.
    expect(apply(raw("x", "y"))).toBe(RESOLVED);
  });
});
