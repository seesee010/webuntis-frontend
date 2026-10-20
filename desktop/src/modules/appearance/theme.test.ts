import { describe, expect, it } from "vitest";
import { computeTheme, readableOn } from "./theme";

const defaults: Record<string, unknown> = {
  "ui.theme.mode": "system",
  "ui.theme.palette": "neutral",
  "ui.theme.accent": "#4f46e5",
  "ui.theme.highContrast": false,
  "ui.theme.density": "cozy",
  "ui.theme.radius": 10,
  "ui.theme.sidebarWidth": 220,
  "ui.theme.shadows": true,
  "ui.theme.animations": true,
  "ui.theme.font": "system",
  "ui.theme.fontCustom": "",
  "ui.theme.fontSize": 14,
  "ui.theme.statusStyle": "tint",
  "ui.theme.customCss": "",
};

const getter = (over: Record<string, unknown> = {}) => <T,>(k: string) => ({ ...defaults, ...over })[k] as T;

describe("computeTheme", () => {
  it("follows the system in system mode", () => {
    expect(computeTheme(getter(), true).dark).toBe(true);
    expect(computeTheme(getter(), false).attrs["data-theme"]).toBe("light");
    expect(computeTheme(getter({ "ui.theme.mode": "dark" }), false).dark).toBe(true);
  });

  it("maps settings to CSS variables", () => {
    const t = computeTheme(getter({ "ui.theme.density": "compact", "ui.theme.radius": 4, "ui.theme.fontCustom": "Plex" }), false);
    expect(t.vars["--space"]).toBe("0.75");
    expect(t.vars["--radius"]).toBe("4px");
    expect(t.vars["--font"]).toMatch(/^Plex, /);
    expect(t.vars["--c-exam"]).toBe("#c026d3");
  });

  it("uses user status colours over the defaults", () => {
    expect(computeTheme(getter({ "ui.theme.status.exam": "#000000" }), false).vars["--c-exam"]).toBe("#000000");
  });

  it("disables transitions without animations", () => {
    expect(computeTheme(getter({ "ui.theme.animations": false }), false).vars["--transition"]).toBe("0s");
  });
});

describe("readableOn", () => {
  it("picks dark text on light colours and vice versa", () => {
    expect(readableOn("#ffffff")).toBe("#111111");
    expect(readableOn("#4f46e5")).toBe("#ffffff");
    expect(readableOn("#88c0d0")).toBe("#111111");
  });
});
