import { describe, expect, it } from "vitest";
import { groupBy } from "./relative";

describe("groupBy", () => {
  it("keeps first-seen key order", () => {
    expect(groupBy([3, 1, 4, 1, 5], (n) => (n % 2 ? "odd" : "even"))).toEqual([["odd", [3, 1, 1, 5]], ["even", [4]]]);
  });
});
