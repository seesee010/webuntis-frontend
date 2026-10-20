import { describe, expect, it } from "vitest";
import { Scope } from "@/core/reactive";
import { collectSections, registerDefaults } from "@/core/schema";
import { settle, testContext } from "@/test/ctx";
import { snapshot } from "@/test/fixtures";
import appearance from "./appearance";
import datasource from "./datasource";
import general from "./general";
import { modules } from "./index";
import status from "./status";

describe("module list", () => {
  it("has unique ids, routes and setting keys", async () => {
    const ctx = await testContext(snapshot(), modules);
    expect(() => registerDefaults(ctx)).not.toThrow(); // no key is declared by two modules
    const paths = modules.flatMap((m) => (m.route ? [m.route.path] : []));
    expect(new Set(paths).size).toBe(paths.length);
    expect(collectSections(ctx).length).toBeGreaterThan(5);
  });
});

describe("datasource", () => {
  it("shows CLI options only when the CLI is the source", async () => {
    const ctx = await testContext(snapshot(), [datasource]);
    const binary = datasource.settings![0].fields.find((f) => f.key === "backend.cli.binary")!;
    const latency = datasource.settings![0].fields.find((f) => f.key === "backend.sample.latencyMs")!;
    expect(binary.visibleIf!(ctx.settings)).toBe(false);
    expect(latency.visibleIf!(ctx.settings)).toBe(true);
    ctx.settings.set("backend.provider", "cli");
    expect(binary.visibleIf!(ctx.settings)).toBe(true);
    expect(latency.visibleIf!(ctx.settings)).toBe(false);
  });

  it("mirrors the backend defaults", async () => {
    const ctx = await testContext(snapshot(), [datasource]);
    expect([ctx.settings.get("backend.provider"), ctx.settings.get("backend.refreshMinutes"), ctx.settings.get("backend.cli.maxAge")]).toEqual(["sample", 10, "5m"]);
  });
});

describe("general", () => {
  it("opens the start page and can remember the last page", async () => {
    history.replaceState(null, "", "#");
    const ctx = await testContext(snapshot(), [general, status], { ui: { startPage: "/status", rememberLastPage: true } });
    const off = general.setup!(ctx) as () => void;
    await new Promise((r) => window.addEventListener("hashchange", r, { once: true }));
    expect(location.hash).toBe("#/status");
    expect(ctx.settings.get("ui.lastPage")).toBe("/status");
    off();
  });
});

describe("appearance", () => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;

  it("applies the theme live", async () => {
    const ctx = await testContext(snapshot(), [appearance], { ui: { theme: { mode: "dark", accent: "#ff0000" } } });
    const off = appearance.setup!(ctx) as () => void;
    const root = document.documentElement;
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(root.style.getPropertyValue("--accent")).toBe("#ff0000");
    ctx.settings.set("ui.theme.customCss", ".x{}");
    expect(document.getElementById("user-css")?.textContent).toBe(".x{}");
    ctx.settings.set("ui.theme.mode", "light");
    expect(root.getAttribute("data-theme")).toBe("light");
    off();
  });

  it("applies presets", async () => {
    const ctx = await testContext(snapshot(), [appearance]);
    const field = appearance.settings![0].fields.find((f) => f.type === "custom")!;
    if (field.type !== "custom") throw new Error();
    const el = field.render(ctx, new Scope());
    (el.querySelector('[data-preset="nord"]') as HTMLButtonElement).click();
    expect(ctx.settings.get("ui.theme.palette")).toBe("nord");
    expect(ctx.settings.get("ui.theme.status.cancelled")).toBe("#bf616a");
  });
});

describe("status", () => {
  it("shows provider and window", async () => {
    const ctx = await testContext(snapshot(), [status]);
    await ctx.data.loadOverview();
    const el = status.route!.render(ctx, new Scope(), new URLSearchParams());
    await settle();
    expect(el.textContent).toContain("Sample data");
    expect(el.textContent).toContain("2026-10-05 – 2026-10-11");
  });
});
