import { describe, expect, it } from "vitest";
import { Scope } from "@/core/reactive";
import { settle, testContext } from "@/test/ctx";
import { snapshot } from "@/test/fixtures";
import timetable from "@/modules/timetable";
import subjects from "./index";
import { subjectEditor, toHex } from "./editor";

describe("subject editor", () => {
  it("lists subjects from the data and stores overrides", async () => {
    const ctx = await testContext(snapshot(), [subjects]);
    await ctx.data.loadOverview();
    const el = subjectEditor(ctx, new Scope());
    expect([...el.querySelectorAll<HTMLElement>(".subject-row")].map((r) => r.dataset.code)).toEqual(["ART", "CS", "ENG", "GEO", "MATH"]);

    const row = el.querySelector('[data-code="MATH"]')!;
    const [name, , emoji] = row.querySelectorAll<HTMLInputElement>("input.input, input.color");
    name.value = "Maths";
    name.dispatchEvent(new Event("change"));
    emoji.value = "📐";
    emoji.dispatchEvent(new Event("change"));
    const hide = row.querySelector<HTMLInputElement>(".switch")!;
    hide.checked = true;
    hide.dispatchEvent(new Event("change"));
    expect(ctx.settings.get("subjects.custom")).toEqual({ MATH: { name: "Maths", emoji: "📐", hidden: true } });

    hide.checked = false;
    hide.dispatchEvent(new Event("change"));
    expect(ctx.settings.get("subjects.custom.MATH")).toEqual({ name: "Maths", emoji: "📐" });
    (row.querySelector(".icon-btn") as HTMLButtonElement).click();
    expect(ctx.settings.get("subjects.custom")).toEqual({});
  });

  it("converts auto colours for the colour picker", () => {
    expect(toHex("hsl(0 100% 50%)")).toBe("#ff0000");
    expect(toHex("#123456")).toBe("#123456");
  });
});

describe("filters in views", () => {
  it("the timetable redraws when a filter changes", async () => {
    const ctx = await testContext(snapshot(), [subjects, timetable]);
    const el = timetable.route!.render(ctx, new Scope(), new URLSearchParams({ date: "2026-10-07" }));
    await settle();
    const before = el.querySelectorAll(".tt-lesson").length;
    ctx.settings.set("filters.mode", "except");
    ctx.settings.set("filters.subjects", ["MATH"]);
    expect(el.querySelectorAll(".tt-lesson").length).toBe(before - 1);
    expect(el.textContent).not.toContain("MATH");
  });
});
