import { describe, expect, it } from "vitest";

import { filterPanelState } from "@/components/collection/filter-utils";

/**
 * The whole point of these is the `"controls"` branch, which cannot be reached
 * by rendering against this store: `productFilteringEnabled` is `false` on this
 * plan, so no amount of clicking the Filter button will produce it. Testing the
 * decision as a pure function is the only honest way to show it works without
 * editing the code to fake the flag.
 */
describe("filterPanelState", () => {
  it("says unavailable when the store's plan has filtering switched off", () => {
    expect(filterPanelState(false, 0)).toBe("unavailable");
  });

  it("still says unavailable even if facets somehow arrived", () => {
    // Belt and braces: the plan flag is the capability, and it wins. A facet
    // list turning up while the flag is false is a contradiction, and claiming
    // filtering works on that basis is the lie this function exists to stop.
    expect(filterPanelState(false, 7)).toBe("unavailable");
  });

  it("distinguishes 'no facets matched' from 'filtering unavailable'", () => {
    // Both are an empty list. Only the flag separates them, and reading them as
    // the same thing is what made the panel assert a plan limitation on every
    // store that forked this.
    expect(filterPanelState(true, 0)).toBe("none");
  });

  it("shows controls when filtering is on and facets came back", () => {
    expect(filterPanelState(true, 1)).toBe("controls");
    expect(filterPanelState(true, 7)).toBe("controls");
  });
});
