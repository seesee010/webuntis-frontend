import { describe, expect, it } from "vitest";
import { addDays, daysBetween, hhmm, isoWeek, minutes, range, startOfWeek, weekdayIndex } from "./dates";

describe("dates", () => {
  it("does calendar arithmetic across months and DST", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(daysBetween("2026-10-25", "2026-10-26")).toBe(1);
  });

  it("finds week starts", () => {
    expect(weekdayIndex("2026-10-05")).toBe(0);
    expect(startOfWeek("2026-10-08")).toBe("2026-10-05");
    expect(startOfWeek("2026-10-08", 6)).toBe("2026-10-04");
    expect(startOfWeek("2026-10-04")).toBe("2026-09-28");
  });

  it("computes ISO weeks", () => {
    expect(isoWeek("2026-01-01")).toBe(1);
    expect(isoWeek("2026-10-05")).toBe(41);
    expect(isoWeek("2027-01-01")).toBe(53);
  });

  it("converts times", () => {
    expect(minutes("07:50")).toBe(470);
    expect(hhmm(470)).toBe("07:50");
    expect(range("2026-10-30", "2026-11-02")).toHaveLength(4);
  });
});
