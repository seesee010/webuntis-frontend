import { describe, expect, it } from "vitest";
import type { Lesson, Period } from "@/core/api/types";
import { assignColumns, clipGrid, effectiveGrid, linearAxis, mergeAdjacent, periodAxis } from "./layout";

const grid: Period[] = [
  { index: 1, start: "08:00", end: "08:50" },
  { index: 2, start: "08:55", end: "09:45" },
  { index: 3, start: "10:00", end: "10:50" },
];

function lesson(start: string, end: string, subject = "MATH", extra: Partial<Lesson> = {}): Lesson {
  return {
    id: start, date: "2026-10-05", start, end, status: "regular",
    cancelled: false, removed: false, exam: false, event: false, substitution: false, noTeacher: false,
    subjects: [{ short: subject }], teachers: [], rooms: [], classes: [], ...extra,
  };
}

describe("periodAxis", () => {
  const axis = periodAxis(grid, 60, 10);
  it("gives each period the same height and shrinks breaks", () => {
    expect(axis.height).toBe(200);
    expect(axis.y(8 * 60)).toBe(0);
    expect(axis.y(8 * 60 + 50)).toBe(60);
    expect(axis.y(8 * 60 + 55)).toBe(70);
    expect(axis.y(10 * 60)).toBe(140);
    expect(axis.y(9 * 60 + 52.5)).toBeCloseTo(135); // halfway through the break after period 2
    expect(axis.y(23 * 60)).toBe(200);
    expect(axis.marks.map((m) => m.label)).toEqual(["1", "2", "3"]);
  });
});

describe("linearAxis", () => {
  it("rounds to full hours", () => {
    const axis = linearAxis(8 * 60 + 10, 9 * 60 + 5, 1);
    expect(axis.height).toBe(120);
    expect(axis.y(9 * 60)).toBe(60);
    expect(axis.marks).toHaveLength(2);
  });
});

describe("grids", () => {
  it("derives a grid from lessons when the school has none", () => {
    const g = effectiveGrid([], [lesson("09:00", "09:45"), lesson("08:00", "08:45"), lesson("08:00", "08:45", "ENG")]);
    expect(g.map((p) => [p.index, p.start])).toEqual([[1, "08:00"], [2, "09:00"]]);
  });
  it("clips to a period range", () => {
    expect(clipGrid(grid, 2, 0).map((p) => p.index)).toEqual([2, 3]);
    expect(clipGrid(grid, 0, 1).map((p) => p.index)).toEqual([1]);
  });
});

describe("assignColumns", () => {
  it("puts overlapping lessons side by side and others full width", () => {
    const placed = assignColumns([
      lesson("08:00", "09:45", "CS"),
      lesson("08:00", "09:45", "ART"),
      lesson("10:00", "10:50", "GEO"),
    ]);
    const by = Object.fromEntries(placed.map((p) => [p.item.subjects[0].short, [p.col, p.cols]]));
    expect(by.CS[1]).toBe(2);
    expect(by.ART[1]).toBe(2);
    expect(by.CS[0]).not.toBe(by.ART[0]);
    expect(by.GEO).toEqual([0, 1]);
  });

  it("reuses freed columns within a chained cluster", () => {
    const placed = assignColumns([lesson("08:00", "09:00", "A"), lesson("08:30", "10:00", "B"), lesson("09:00", "09:30", "C")]);
    expect(placed.every((p) => p.cols === 2)).toBe(true);
    expect(placed.find((p) => p.item.subjects[0].short === "C")!.col).toBe(0);
  });
});

describe("mergeAdjacent", () => {
  it("joins double lessons but keeps different ones apart", () => {
    const out = mergeAdjacent([lesson("08:00", "08:50"), lesson("08:55", "09:45"), lesson("10:00", "10:50", "ENG")]);
    expect(out.map((l) => [l.start, l.end])).toEqual([["08:00", "09:45"], ["10:00", "10:50"]]);
    const kept = mergeAdjacent([lesson("08:00", "08:50"), lesson("08:55", "09:45", "MATH", { status: "cancelled" })]);
    expect(kept).toHaveLength(2);
  });
});
