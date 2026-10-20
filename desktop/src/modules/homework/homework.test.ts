import { describe, expect, it } from "vitest";
import type { Homework } from "@/core/api/types";
import { addDays, today } from "@/core/dates";
import { Scope } from "@/core/reactive";
import { settle, testContext } from "@/test/ctx";
import { snapshot } from "@/test/fixtures";
import homework from "./index";
import { sortHomework, stateOf } from "./logic";

const hw = (id: string, due: string, extra: Partial<Homework> = {}): Homework => ({
  id, date: addDays(due, -3), dueDate: due, text: `Task ${id}`, completed: false,
  subjects: [{ short: "ENG" }], teachers: [{ short: "BRO" }], attachments: [], ...extra,
});

describe("homework logic", () => {
  it("derives the state", () => {
    expect(stateOf(hw("a", "2026-10-01"), "2026-10-05", false)).toBe("overdue");
    expect(stateOf(hw("a", "2026-10-09"), "2026-10-05", false)).toBe("open");
    expect(stateOf(hw("a", "2026-10-01"), "2026-10-05", true)).toBe("done");
    expect(stateOf(hw("a", "2026-10-09", { completed: true }), "2026-10-05", false)).toBe("done");
  });

  it("puts overdue first and done last", () => {
    const items = [hw("done", "2026-10-02", { completed: true }), hw("later", "2026-10-20"), hw("over", "2026-10-01"), hw("soon", "2026-10-06")];
    const state = (x: Homework) => stateOf(x, "2026-10-05", false);
    expect(sortHomework(items, "due", state, () => "").map((x) => x.id)).toEqual(["over", "soon", "later", "done"]);
  });
});

describe("homework view", () => {
  const t = today();
  const snap = snapshot({
    homework: [hw("1", addDays(t, 2), { attachments: [{ name: "sheet.pdf" }] }), hw("2", addDays(t, -1)), hw("3", addDays(t, 5), { completed: true })],
  });

  it("marks homework done locally and can hide completed work", async () => {
    const ctx = await testContext(snap, [homework]);
    await ctx.data.loadOverview();
    const el = homework.route!.render(ctx, new Scope(), new URLSearchParams());
    await settle();
    const ids = () => [...el.querySelectorAll<HTMLElement>(".list-row")].map((r) => r.dataset.id);
    expect(ids()).toEqual(["2", "1", "3"]);
    expect(el.querySelector('[data-id="2"]')!.classList.contains("hw-overdue")).toBe(true);
    expect(el.textContent).toContain("sheet.pdf");
    expect(el.querySelector(".card-title .chip")!.textContent).toBe("2 open");

    const box = el.querySelector<HTMLInputElement>('[data-id="1"] .check')!;
    box.checked = true;
    box.dispatchEvent(new Event("change"));
    expect(ctx.settings.get("state.homework.done")).toEqual(["1"]);
    expect(el.querySelector(".card-title .chip")!.textContent).toBe("1 open");

    ctx.settings.set("homework.showCompleted", false);
    expect(ids()).toEqual(["2"]);
  });

  it("widget shows only open work", async () => {
    const ctx = await testContext(snap, [homework]);
    await ctx.data.loadOverview();
    const el = homework.widgets![0].render(ctx, new Scope());
    expect(el.querySelectorAll(".list-row")).toHaveLength(2);
  });
});
