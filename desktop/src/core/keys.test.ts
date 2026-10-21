import { describe, expect, it } from "vitest";
import { Keymap, formatBinding, normalizeBinding, strokeOf } from "./keys";

const ev = (key: string, mods: Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey", boolean>> = {}) => ({
  key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods,
});

describe("strokeOf", () => {
  it("maps Ctrl on Linux and Cmd on macOS to mod", () => {
    expect(strokeOf(ev("k", { ctrlKey: true }), false)).toBe("mod+k");
    expect(strokeOf(ev("K", { metaKey: true, shiftKey: true }), true)).toBe("mod+shift+k");
    expect(strokeOf(ev("k", { ctrlKey: true }), true)).toBe("ctrl+k");
  });

  it("keeps shift implicit for symbols and ignores bare modifiers", () => {
    expect(strokeOf(ev("?", { shiftKey: true }), false)).toBe("?");
    expect(strokeOf(ev("ArrowLeft", { shiftKey: true }), false)).toBe("shift+arrowleft");
    expect(strokeOf(ev("Shift", { shiftKey: true }), false)).toBe("");
    expect(strokeOf(ev(" "), false)).toBe("space");
  });
});

describe("bindings", () => {
  it("normalise user input", () => {
    expect(normalizeBinding(" Shift+Ctrl+K ")).toBe("mod+shift+k");
    expect(normalizeBinding("G   T")).toBe("g t");
    expect(normalizeBinding("cmd+esc")).toBe("mod+escape");
  });

  it("format for display", () => {
    expect(formatBinding("mod+k", false)).toEqual(["Ctrl+K"]);
    expect(formatBinding("mod+shift+k", true)).toEqual(["⌘⇧K"]);
    expect(formatBinding("g t", false)).toEqual(["G", "T"]);
    expect(formatBinding("arrowleft", false)).toEqual(["←"]);
    expect(formatBinding("", false)).toEqual([]);
  });
});

describe("Keymap", () => {
  const km = () => new Keymap(new Map([["mod+k", "palette"], ["g t", "timetable"], ["g d", "dashboard"], ["t", "today"]]), 1000);

  it("matches single strokes and sequences", () => {
    const k = km();
    expect(k.feed("mod+k", 0)).toEqual({ kind: "match", target: "palette" });
    expect(k.feed("g", 10)).toEqual({ kind: "pending" });
    expect(k.feed("t", 20)).toEqual({ kind: "match", target: "timetable" });
    expect(k.feed("t", 30)).toEqual({ kind: "match", target: "today" });
  });

  it("drops stale prefixes after the timeout", () => {
    const k = km();
    k.feed("g", 0);
    expect(k.feed("t", 5000)).toEqual({ kind: "match", target: "today" });
  });

  it("recovers when a sequence is broken", () => {
    const k = km();
    k.feed("g", 0);
    expect(k.feed("x", 10)).toEqual({ kind: "none" });
    k.feed("g", 20);
    expect(k.feed("mod+k", 30)).toEqual({ kind: "match", target: "palette" });
  });
});
