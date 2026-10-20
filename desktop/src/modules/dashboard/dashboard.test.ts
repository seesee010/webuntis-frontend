import { describe, expect, it } from "vitest";
import { Scope } from "@/core/reactive";
import { settle, testContext } from "@/test/ctx";
import { snapshot } from "@/test/fixtures";
import dashboard from "./index";

describe("dashboard", () => {
  it("renders the enabled widgets in the stored order and size", async () => {
    const ctx = await testContext(snapshot(), [dashboard], {
      dashboard: { layout: [{ id: "week-stats", enabled: true, size: "full" }, { id: "now", enabled: false, size: "small" }] },
    });
    await ctx.data.loadOverview();
    const el = dashboard.route!.render(ctx, new Scope(), new URLSearchParams());
    await settle();
    const ids = [...el.querySelectorAll<HTMLElement>(".widget")].map((x) => x.dataset.widget);
    expect(ids).toEqual(["week-stats", "agenda", "changes"]);
    expect(el.querySelector(".widget")!.classList.contains("size-full")).toBe(true);
  });
});
