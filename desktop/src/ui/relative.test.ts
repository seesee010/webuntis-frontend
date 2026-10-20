import { describe, expect, it } from "vitest";
import { groupBy, relativeDay } from "./relative";

describe("relativeDay", () => {
  it("names nearby days", () => {
    expect(relativeDay("2026-10-05", "2026-10-05")).toBe("today");
    expect(relativeDay("2026-10-06", "2026-10-05")).toBe("tomorrow");
    expect(relativeDay("2026-10-04", "2026-10-05")).toBe("yesterday");
    expect(relativeDay("2026-10-12", "2026-10-05")).toBe("in 7 days");
    expect(relativeDay("2026-09-30", "2026-10-05")).toBe("5 days ago");
  });
});

describe("groupBy", () => {
  it("keeps first-seen key order", () => {
    expect(groupBy([3, 1, 4, 1, 5], (n) => (n % 2 ? "odd" : "even"))).toEqual([["odd", [3, 1, 1, 5]], ["even", [4]]]);
  });
});
