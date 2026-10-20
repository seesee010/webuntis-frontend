import { describe, expect, it } from "vitest";
import type { Absence } from "@/core/api/types";
import { Scope } from "@/core/reactive";
import { settle, testContext } from "@/test/ctx";
import { snapshot } from "@/test/fixtures";
import absences from "./index";
import { missedLessons, schoolDays, totals } from "./logic";

const grid = snapshot().timeGrid; // 08:00-08:50, 08:55-09:45, 10:00-10:50
const ab = (id: string, s: string, e: string, st?: string, et?: string, excused = true): Absence => ({ id, startDate: s, endDate: e, startTime: st, endTime: et, excused, reason: "Illness" });

describe("absence logic", () => {
  it("counts every overlapped period", () => {
    expect(missedLessons(ab("1", "2026-10-05", "2026-10-05", "08:30", "09:00"), grid)).toBe(2);
    expect(missedLessons(ab("1", "2026-10-05", "2026-10-05", "08:50", "08:55"), grid)).toBe(0);
  });

  it("counts weekdays of multi-day absences", () => {
    const fri2mon = ab("1", "2026-10-09", "2026-10-12", "10:00", "08:50");
    expect(schoolDays(fri2mon)).toBe(2);
    expect(missedLessons(fri2mon, grid)).toBe(1 + 1);
  });

  it("sums totals", () => {
    expect(totals([ab("1", "2026-10-05", "2026-10-06"), ab("2", "2026-10-07", "2026-10-07", "08:00", "08:50", false)], grid)).toEqual({ count: 2, days: 3, lessons: 7, unexcused: 1 });
  });
});

describe("absences view", () => {
  it("shows totals, marks unexcused absences and filters", async () => {
    const snap = snapshot({ absences: [ab("1", "2026-10-05", "2026-10-05"), ab("2", "2026-10-07", "2026-10-07", "08:00", "08:50", false)] });
    const ctx = await testContext(snap, [absences]);
    await ctx.data.loadOverview();
    const el = absences.route!.render(ctx, new Scope(), new URLSearchParams());
    await settle();
    expect([...el.querySelectorAll(".stat-n")].map((s) => s.textContent)).toEqual(["2", "2", "4", "1"]);
    expect(el.querySelector('[data-id="2"]')!.classList.contains("unexcused")).toBe(true);
    ctx.settings.set("absences.sort", "newest");
    expect([...el.querySelectorAll<HTMLElement>(".list-row")].map((r) => r.dataset.id)).toEqual(["2", "1"]);
    ctx.settings.set("absences.onlyUnexcused", true);
    expect(el.querySelectorAll(".list-row")).toHaveLength(1);
  });

  it("is off on the dashboard by default", () => {
    expect(absences.widgets![0].enabledByDefault).toBe(false);
  });
});
