import { describe, expect, it } from "vitest";
import type { AppContext } from "./app";
import { ModuleRegistry, defineModule } from "./module";
import { collectSections, matches, registerDefaults, type Field, type SettingsSection } from "./schema";
import { SettingsStore } from "./settings";
import type { ApiClient } from "./api/client";

const field: Field = { key: "ui.theme.accent", type: "color", label: "Accent colour", default: "#4f46e5", keywords: ["highlight"] };
const section: SettingsSection = { id: "theme", title: "Appearance", fields: [field] };

function ctxWith(...sections: SettingsSection[][]): AppContext {
  const modules = new ModuleRegistry();
  sections.forEach((settings, i) => modules.register(defineModule({ id: `m${i}`, title: `M${i}`, icon: "info", settings })));
  return { modules, settings: new SettingsStore({} as ApiClient) } as unknown as AppContext;
}

describe("matches", () => {
  it("searches label, section, key and keywords, all words required", () => {
    expect(matches(field, section, "")).toBe(true);
    expect(matches(field, section, "ACCENT")).toBe(true);
    expect(matches(field, section, "appearance highlight")).toBe(true);
    expect(matches(field, section, "theme.accent")).toBe(true);
    expect(matches(field, section, "accent font")).toBe(false);
  });
});

describe("registerDefaults", () => {
  it("makes schema defaults the fallback of the store", () => {
    const ctx = ctxWith([section]);
    registerDefaults(ctx);
    expect(ctx.settings.get("ui.theme.accent")).toBe("#4f46e5");
  });

  it("rejects duplicate keys across modules", () => {
    expect(() => registerDefaults(ctxWith([section], [section]))).toThrow(/declared twice/);
  });

  it("sorts sections by order", () => {
    const a = { id: "a", title: "A", order: 50, fields: [] };
    const b = { id: "b", title: "B", order: 10, fields: [] };
    expect(collectSections(ctxWith([a], [b])).map((s) => s.id)).toEqual(["b", "a"]);
  });
});
