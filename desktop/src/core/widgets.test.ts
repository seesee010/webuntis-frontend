import { describe, expect, it } from "vitest";
import { resolveLayout, type WidgetDef } from "./widgets";

const w = (id: string, extra: Partial<WidgetDef> = {}): WidgetDef => ({ id, title: id, icon: "info", render: () => document.createElement("div"), ...extra });

describe("resolveLayout", () => {
  it("keeps the stored order, drops unknown and appends new widgets", () => {
    const out = resolveLayout(
      [w("a"), w("b"), w("c", { enabledByDefault: false, size: "small" })],
      [{ id: "b", enabled: false, size: "full" }, { id: "gone", enabled: true, size: "small" }, { id: "a", enabled: true, size: "medium" }],
    );
    expect(out).toEqual([
      { id: "b", enabled: false, size: "full" },
      { id: "a", enabled: true, size: "medium" },
      { id: "c", enabled: false, size: "small" },
    ]);
  });
});
