import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { bindingKey } from "@/core/commands";
import { defineModule } from "@/core/module";
import { Scope } from "@/core/reactive";
import { setupModules } from "@/core/bootstrap";
import { keybindingControl } from "@/modules/settings/controls";
import { settle, testContext } from "@/test/ctx";
import { snapshot } from "@/test/fixtures";
import timetable from "@/modules/timetable";
import keyboard, { bindings, conflicts } from "./index";
import { openPalette, rankCommands } from "./palette";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event("close")); };
});

const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = window) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));

let teardown: (() => void) | undefined;
afterEach(() => {
  teardown?.();
  document.querySelectorAll("dialog").forEach((d) => (d as HTMLDialogElement).close());
});

async function setup(settings: Record<string, unknown> = {}) {
  const run = vi.fn();
  const runOnTimetable = vi.fn();
  const mod = defineModule({
    id: "t", title: "T", icon: "info",
    commands: [
      { id: "t.seq", title: "Sequence", key: "x y", run },
      { id: "t.only", title: "Only on timetable", key: "q", when: (c) => c.router.route.get().path === "/timetable", run: runOnTimetable },
    ],
  });
  const ctx = await testContext(snapshot(), [mod, timetable, keyboard], settings);
  teardown = setupModules(ctx);
  return { ctx, run, runOnTimetable };
}

describe("shortcuts", () => {
  it("run commands for sequences and respect when()", async () => {
    history.replaceState(null, "", "#/dashboard");
    const { run, runOnTimetable } = await setup();
    press("x");
    press("y");
    expect(run).toHaveBeenCalledOnce();
    press("q");
    expect(runOnTimetable).not.toHaveBeenCalled();
  });

  it("ignore single keys while typing but not mod shortcuts", async () => {
    const { ctx, run } = await setup();
    const input = document.body.appendChild(document.createElement("input"));
    press("x", {}, input);
    press("y", {}, input);
    expect(run).not.toHaveBeenCalled();
    press("k", { ctrlKey: true }, input);
    expect(document.querySelector("dialog.palette")).not.toBeNull();
    input.remove();
    expect(ctx).toBeTruthy();
  });

  it("follow rebinding and can be switched off", async () => {
    const { ctx, run } = await setup({ keys: { t_seq: "z" } });
    expect(bindings(ctx).get("z")?.id).toBe("t.seq");
    press("z");
    expect(run).toHaveBeenCalledOnce();
    ctx.settings.set("keys.enabled", false);
    press("z");
    expect(run).toHaveBeenCalledOnce();
  });

  it("report conflicts", async () => {
    const { ctx } = await setup({ keys: { t_seq: "r" } });
    expect(conflicts(ctx).get("r")).toEqual(["t.seq", "data.refresh"]);
  });

  it("drive the timetable through commands", async () => {
    const { ctx } = await setup();
    const moved = new Promise((r) => window.addEventListener("hashchange", r, { once: true }));
    ctx.router.navigate("/timetable");
    await moved;
    const el = timetable.route!.render(ctx, new Scope(), new URLSearchParams({ date: "2026-10-07" }));
    await settle();
    const label = () => el.querySelector(".tt-label")!.textContent;
    const before = label();
    press("ArrowRight");
    expect(label()).not.toBe(before);
    press("d");
    expect(el.querySelector('[data-mode="day"]')!.classList.contains("active")).toBe(true);
  });
});

describe("palette", () => {
  it("ranks available commands and runs the selected one", async () => {
    history.replaceState(null, "", "#/dashboard");
    const { ctx, run } = await setup();
    expect(rankCommands(ctx, "sequ")[0].id).toBe("t.seq");
    expect(rankCommands(ctx, "").some((c) => c.id === "t.only")).toBe(false);

    openPalette(ctx);
    const input = document.querySelector<HTMLInputElement>(".palette-input")!;
    input.value = "sequ";
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(run).toHaveBeenCalledOnce();
    expect(document.querySelector("dialog.palette")).toBeNull();
  });

  it("shows translated titles and key caps", async () => {
    const { ctx } = await setup({ ui: { language: "de" } });
    openPalette(ctx);
    const text = document.querySelector(".palette-list")!.textContent!;
    expect(text).toContain("Gehe zu Stundenplan");
    expect(document.querySelector(".palette-list kbd")).not.toBeNull();
  });
});

describe("keybinding control", () => {
  it("records strokes, clears and cancels", async () => {
    const { ctx } = await setup();
    const btn = keybindingControl(bindingKey("t.seq"), ctx, new Scope());
    btn.click();
    press("k", { ctrlKey: true, shiftKey: true });
    press("Enter");
    expect(ctx.settings.get(bindingKey("t.seq"))).toBe("mod+shift+k");
    btn.click();
    press("Backspace");
    expect(ctx.settings.get(bindingKey("t.seq"))).toBe("");
    btn.click();
    press("a");
    press("Escape");
    expect(ctx.settings.get(bindingKey("t.seq"))).toBe("");
  });

  it("is available as a schema field type", async () => {
    const { ctx } = await setup();
    const { renderControl } = await import("@/modules/settings/controls");
    const el = renderControl({ key: "keys.custom", type: "keybinding", label: "x", default: "mod+j" }, ctx, new Scope());
    expect(el.classList.contains("keybinding")).toBe(true);
  });
});
