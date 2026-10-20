import { describe, expect, it } from "vitest";
import type { Holiday } from "@/core/api/types";
import { addDays, startOfWeek, today } from "@/core/dates";
import { Scope } from "@/core/reactive";
import { settle, testContext } from "@/test/ctx";
import { snapshot } from "@/test/fixtures";
import holidays from "./index";
import { mergeBreaks, schoolDaysUntil } from "./logic";

const hol = (id: string, name: string, start: string, end: string): Holiday => ({ id, name, start, end });

describe("holiday logic", () => {
  it("merges touching breaks across weekends and keeps the longest name", () => {
    const merged = mergeBreaks([
      hol("2", "Autumn break", "2026-10-26", "2026-10-30"),
      hol("1", "Public holiday", "2026-10-23", "2026-10-23"), // Friday before
      hol("3", "All Saints", "2026-11-02", "2026-11-02"), // Monday after the weekend
      hol("4", "Separate", "2026-11-04", "2026-11-04"),
    ]);
    expect(merged.map((h) => [h.name, h.start, h.end])).toEqual([
      ["Autumn break", "2026-10-23", "2026-11-02"],
      ["Separate", "2026-11-04", "2026-11-04"],
    ]);
  });

  it("counts school days until a break", () => {
    const brk = hol("1", "Break", "2026-10-26", "2026-10-30");
    expect(schoolDaysUntil(brk, "2026-10-19", [brk])).toBe(5);
    const holidayInBetween = hol("2", "Day off", "2026-10-21", "2026-10-21");
    expect(schoolDaysUntil(brk, "2026-10-19", [brk, holidayInBetween])).toBe(4);
    expect(schoolDaysUntil(brk, "2026-10-27", [brk])).toBe(0);
  });
});

describe("holidays view", () => {
  const mon = startOfWeek(today());
  const snap = snapshot({
    holidays: [hol("past", "Old", addDays(mon, -30), addDays(mon, -28)), hol("next", "Autumn break", addDays(mon, 14), addDays(mon, 18))],
  });

  it("hides past holidays unless asked and counts down", async () => {
    const ctx = await testContext(snap, [holidays]);
    await ctx.data.loadOverview();
    const el = holidays.route!.render(ctx, new Scope(), new URLSearchParams());
    await settle();
    const ids = () => [...el.querySelectorAll<HTMLElement>(".list-row")].map((r) => r.dataset.id);
    expect(ids()).toEqual(["next"]);
    expect(el.querySelector(".chip")!.textContent).toMatch(/school days$/);
    ctx.settings.set("holidays.showPast", true);
    expect(ids()).toEqual(["past", "next"]);
  });

  it("widget shows the next break", async () => {
    const ctx = await testContext(snap, [holidays]);
    await ctx.data.loadOverview();
    expect(holidays.widgets![0].render(ctx, new Scope()).textContent).toContain("Autumn break");
  });
});
