import { describe, expect, it, vi } from "vitest";
import { defineModule } from "@/core/module";
import { Scope } from "@/core/reactive";
import type { Field } from "@/core/schema";
import { testContext } from "@/test/ctx";
import { snapshot } from "@/test/fixtures";
import settingsPage from "./index";
import { renderControl } from "./controls";

const fields: Field[] = [
  { key: "t.toggle", type: "toggle", label: "Toggle", default: false },
  { key: "t.number", type: "number", label: "Number", default: 5, min: 1, max: 10 },
  { key: "t.range", type: "range", label: "Range", default: 3, min: 0, max: 9, unit: "x" },
  { key: "t.select", type: "select", label: "Select", default: "a", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
  { key: "t.seg", type: "segmented", label: "Segmented", default: "x", options: [{ value: "x", label: "X" }, { value: "y", label: "Y" }] },
  { key: "t.color", type: "color", label: "Colour", default: "#112233" },
  { key: "t.text", type: "text", label: "Text", default: "hi" },
  { key: "t.upper", type: "text", label: "Upper", default: "", normalize: (v) => (/^[a-z]*$/i.test(v) ? v.toUpperCase() : null) },
  { key: "t.list", type: "list", label: "List", default: ["one"] },
  { key: "t.hidden", type: "toggle", label: "Only with toggle", default: false, visibleIf: (s) => s.get("t.toggle") === true },
];
const mod = defineModule({ id: "t", title: "T", icon: "info", settings: [{ id: "test", title: "Test section", fields }] });

async function ctx() {
  return testContext(snapshot(), [mod, settingsPage]);
}

function control(c: Awaited<ReturnType<typeof ctx>>, key: string) {
  return renderControl(fields.find((f) => f.key === key)!, c, new Scope());
}

describe("controls", () => {
  it("bind every field type to the store", async () => {
    const c = await ctx();
    const toggle = control(c, "t.toggle") as HTMLInputElement;
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));
    expect(c.settings.get("t.toggle")).toBe(true);

    const num = control(c, "t.number").querySelector("input")!;
    num.value = "99";
    num.dispatchEvent(new Event("change"));
    expect(c.settings.get("t.number")).toBe(10); // clamped

    const range = control(c, "t.range");
    const slider = range.querySelector("input")!;
    slider.value = "7";
    slider.dispatchEvent(new Event("input"));
    expect(c.settings.get("t.range")).toBe(7);
    expect(range.querySelector("output")?.textContent).toBe("7x");

    const select = control(c, "t.select") as HTMLSelectElement;
    expect(select.value).toBe("a");
    select.value = "b";
    select.dispatchEvent(new Event("change"));
    expect(c.settings.get("t.select")).toBe("b");

    const seg = control(c, "t.seg");
    (seg.querySelector('[data-value="y"]') as HTMLButtonElement).click();
    expect(c.settings.get("t.seg")).toBe("y");
    expect(seg.querySelector(".active")?.textContent).toBe("Y");

    const color = control(c, "t.color");
    const hex = color.querySelector(".hex") as HTMLInputElement;
    hex.value = "nope";
    hex.dispatchEvent(new Event("change"));
    expect(c.settings.get("t.color")).toBe("#112233");
    hex.value = "#abc";
    hex.dispatchEvent(new Event("change"));
    expect(c.settings.get("t.color")).toBe("#abc");
    expect((color.querySelector('input[type="color"]') as HTMLInputElement).value).toBe("#aabbcc");

    const text = control(c, "t.text") as HTMLInputElement;
    text.value = "changed";
    text.dispatchEvent(new Event("change"));
    expect(c.settings.get("t.text")).toBe("changed");

    const upper = control(c, "t.upper") as HTMLInputElement;
    upper.value = "abc";
    upper.dispatchEvent(new Event("change"));
    expect(c.settings.get("t.upper")).toBe("ABC");
    expect(upper.value).toBe("ABC");
    upper.value = "a1";
    upper.dispatchEvent(new Event("change"));
    expect(c.settings.get("t.upper")).toBe("ABC"); // invalid input is not saved
    expect(upper.getAttribute("aria-invalid")).toBe("true");
    upper.value = "ok";
    upper.dispatchEvent(new Event("change"));
    expect(upper.hasAttribute("aria-invalid")).toBe(false);

    const list = control(c, "t.list");
    const input = list.querySelector("input")!;
    input.value = "two";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(c.settings.get("t.list")).toEqual(["one", "two"]);
    (list.querySelector(".chip-x") as HTMLButtonElement).click();
    expect(c.settings.get("t.list")).toEqual(["two"]);
  });
});

describe("settings page", () => {
  it("renders sections, filters by search and honours visibleIf", async () => {
    const c = await ctx();
    const el = settingsPage.route!.render(c, new Scope(), new URLSearchParams());
    const keys = () => [...el.querySelectorAll<HTMLElement>(".setting")].map((s) => s.dataset.key);
    expect(keys()).not.toContain("t.hidden");
    c.settings.set("t.toggle", true);
    expect(keys()).toContain("t.hidden");

    const search = el.querySelector<HTMLInputElement>(".search")!;
    search.value = "colour";
    search.dispatchEvent(new Event("input"));
    expect(keys()).toEqual(["t.color"]);
    search.value = "zzz";
    search.dispatchEvent(new Event("input"));
    expect(el.querySelector(".empty")?.textContent).toContain("zzz");
  });

  it("shows reset buttons only for changed values", async () => {
    const c = await ctx();
    const el = settingsPage.route!.render(c, new Scope(), new URLSearchParams());
    const reset = () => el.querySelector<HTMLButtonElement>('[data-key="t.text"] .reset')!;
    expect(reset().classList.contains("hidden")).toBe(true);
    c.settings.set("t.text", "x");
    expect(reset().classList.contains("hidden")).toBe(false);
    reset().click();
    expect(c.settings.get("t.text")).toBe("hi");
  });

  it("resets everything after confirmation", async () => {
    const c = await ctx();
    const resetAll = vi.spyOn(c.settings, "resetAll").mockResolvedValue();
    vi.stubGlobal("confirm", () => true);
    const el = settingsPage.route!.render(c, new Scope(), new URLSearchParams());
    [...el.querySelectorAll<HTMLButtonElement>(".btn")].find((b) => b.textContent?.includes("Reset all"))!.click();
    expect(resetAll).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("imports without changing the CLI setup unless confirmed, and keeps local data", async () => {
    const c = await testContext(snapshot(), [mod, settingsPage], {
      backend: { cli: { binary: "/usr/bin/untis" } },
      state: { homework: { done: [{ id: "1", date: "2026-11-17" }] } },
    });
    const replaceDoc = vi.spyOn(c.settings, "replace").mockResolvedValue();
    const asked = vi.fn(() => false);
    vi.stubGlobal("confirm", asked);
    const el = settingsPage.route!.render(c, new Scope(), new URLSearchParams());
    const input = el.querySelector<HTMLInputElement>('input[type="file"]')!;
    // jsdom's File has no text(); the page only needs name and text()
    const content = JSON.stringify({ ui: { density: "compact" }, backend: { cli: { binary: "/tmp/evil.sh" } } });
    const file = { name: "theme.json", text: async () => content };
    Object.defineProperty(input, "files", { value: [file] });
    input.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(c.toasts.items.get().map((t) => t.title)).toContain("Settings imported"));

    expect(asked).toHaveBeenCalledWith(expect.stringContaining("/tmp/evil.sh"));
    expect(replaceDoc).toHaveBeenCalledWith({
      ui: { density: "compact" },
      backend: { cli: { binary: "/usr/bin/untis" } },
      state: { homework: { done: [{ id: "1", date: "2026-11-17" }] } },
    });
    vi.unstubAllGlobals();
  });

  it("copies the settings without local data and CLI paths", async () => {
    const c = await testContext(snapshot(), [mod, settingsPage], {
      ui: { density: "compact" },
      backend: { cli: { configPath: "/home/anna/.config/untis/config.json" } },
      state: { notifications: { history: [{ title: "MATH is cancelled" }] } },
    });
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const el = settingsPage.route!.render(c, new Scope(), new URLSearchParams());
    [...el.querySelectorAll<HTMLButtonElement>(".btn")].find((b) => b.textContent?.includes("Copy JSON"))!.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(JSON.parse(writeText.mock.calls[0][0])).toEqual({ ui: { density: "compact" }, backend: { cli: {} } });
    vi.unstubAllGlobals();
  });
});

