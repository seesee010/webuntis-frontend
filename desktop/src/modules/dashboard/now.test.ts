import { describe, expect, it } from "vitest";
import { lesson } from "@/test/fixtures";
import { nowNext } from "./now";

const lessons = [
  lesson("2026-10-05", "08:00", "09:45", "MATH"),
  lesson("2026-10-05", "10:00", "10:50", "ENG", { cancelled: true, status: "cancelled" }),
  lesson("2026-10-05", "10:55", "11:45", "GER"),
  lesson("2026-10-06", "08:00", "08:50", "CS"),
  lesson("2026-10-06", "08:00", "08:50", "ART"),
];

describe("nowNext", () => {
  it("finds the running and the next lesson, skipping cancelled ones", () => {
    const r = nowNext(lessons, "2026-10-05", 8 * 60 + 30);
    expect(r.current.map((l) => l.subjects[0].short)).toEqual(["MATH"]);
    expect(r.next.map((l) => l.subjects[0].short)).toEqual(["GER"]);
    expect(r.today).toHaveLength(2);
  });

  it("looks into the next school day after school", () => {
    const r = nowNext(lessons, "2026-10-05", 15 * 60);
    expect(r.current).toHaveLength(0);
    expect(r.next.map((l) => l.subjects[0].short).sort()).toEqual(["ART", "CS"]);
    expect(r.next.every((l) => l.date === "2026-10-06")).toBe(true);
  });
});
