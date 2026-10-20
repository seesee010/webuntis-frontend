import { describe, expect, it } from "vitest";
import type { Exam } from "@/core/api/types";
import { Scope } from "@/core/reactive";
import { addDays, today } from "@/core/dates";
import { settle, testContext } from "@/test/ctx";
import { snapshot } from "@/test/fixtures";
import exams from "./index";
import { examTitle, sortExams } from "./logic";

const exam = (id: string, date: string, extra: Partial<Exam> = {}): Exam => ({ id, date, subjects: [{ short: "MATH" }], teachers: [], rooms: [], ...extra });

describe("sortExams", () => {
  const list = [exam("old", "2026-10-01"), exam("b", "2026-10-09"), exam("a", "2026-10-06"), exam("older", "2026-09-20")];
  it("orders upcoming ascending and past descending", () => {
    const r = sortExams(list, { today: "2026-10-05", showPast: true });
    expect(r.upcoming.map((e) => e.id)).toEqual(["a", "b"]);
    expect(r.past.map((e) => e.id)).toEqual(["old", "older"]);
    expect(sortExams(list, { today: "2026-10-05", showPast: false }).past).toEqual([]);
  });
  it("titles exams", () => {
    expect(examTitle(exam("x", "", { type: "Quiz" }))).toBe("Quiz");
    expect(examTitle(exam("x", ""))).toBe("Exam");
  });
});

describe("exams view", () => {
  const t = today();
  const snap = snapshot({
    exams: [exam("1", addDays(t, 2), { name: "Algebra test" }), exam("2", addDays(t, 20), { name: "Essay" }), exam("3", addDays(t, -3), { name: "Quiz", grade: "2" })],
  });

  it("lists upcoming and past exams with countdown, highlight and grade", async () => {
    const ctx = await testContext(snap, [exams]);
    await ctx.data.loadOverview();
    const el = exams.route!.render(ctx, new Scope(), new URLSearchParams());
    await settle();
    const ids = [...el.querySelectorAll<HTMLElement>(".list-row")].map((r) => r.dataset.id);
    expect(ids).toEqual(["1", "2", "3"]);
    expect(el.querySelector('[data-id="1"]')!.classList.contains("soon")).toBe(true);
    expect(el.querySelector('[data-id="1"] .chip')!.textContent).toBe("in 2 days");
    expect(el.querySelector('[data-id="3"] .grade')!.textContent).toBe("2");
    ctx.settings.set("exams.showPast", false);
    expect(el.querySelector('[data-id="3"]')).toBeNull();
  });

  it("provides a widget limited to the configured count", async () => {
    const ctx = await testContext(snap, [exams], { exams: { widgetCount: 1 } });
    await ctx.data.loadOverview();
    const el = exams.widgets![0].render(ctx, new Scope());
    expect(el.querySelectorAll(".list-row")).toHaveLength(1);
  });
});
