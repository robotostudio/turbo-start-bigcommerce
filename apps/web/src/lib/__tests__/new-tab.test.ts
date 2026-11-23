import { describe, expect, it } from "vitest";

import { newTab } from "@/lib/new-tab";

describe("newTab", () => {
  it("pairs target=_blank with rel=noopener noreferrer", () => {
    expect(newTab(true)).toEqual({
      target: "_blank",
      rel: "noopener noreferrer",
    });
  });

  it.each([false, null, undefined])("adds nothing for %s", (value) => {
    expect(newTab(value)).toEqual({});
  });
});
