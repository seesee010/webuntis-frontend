import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { modules } from "@/modules";
import { Scope } from "@/core/reactive";
import { settle, testContext } from "@/test/ctx";
import { snapshot } from "@/test/fixtures";
import timetable from "@/modules/timetable";
import { dynamicStrings, schemaStrings, sourceStrings, untranslatable } from "./catalog";
import { de } from "./de";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return sources(p);
    return p.endsWith(".ts") && !p.endsWith(".test.ts") ? [readFileSync(p, "utf8")] : [];
  });
}

describe("German translation", () => {
  const catalog = new Set([...schemaStrings(modules), ...sourceStrings(sources("src")), ...dynamicStrings]);

  it("covers every UI string", () => {
    const missing = [...catalog].filter((s) => !untranslatable.has(s) && !(s in de));
    expect(missing).toEqual([]);
  });

  it("keeps every placeholder", () => {
    const broken = Object.entries(de).filter(([en, tr]) => {
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
      return ph(en) !== ph(tr);
    });
    expect(broken).toEqual([]);
  });

  it("has no stale entries", () => {
    const stale = Object.keys(de).filter((k) => !catalog.has(k));
    expect(stale).toEqual([]);
  });
});

describe("views in German", () => {
  it("render translated labels and German dates", async () => {
    const ctx = await testContext(snapshot(), [timetable], { ui: { language: "de" } });
    const el = timetable.route!.render(ctx, new Scope(), new URLSearchParams({ date: "2026-10-07" }));
    await settle();
    expect(el.textContent).toContain("Heute");
    expect(el.textContent).toContain("KW 41");
    expect(el.querySelector(".tt-dow")!.textContent).toBe("Mo");
    expect(el.querySelector(".st-exam .tt-badge")!.textContent).toBe("Prüfung");
  });

  it("start the week on Sunday when configured", async () => {
    const ctx = await testContext(snapshot(), [timetable], { ui: { firstDay: "6" }, timetable: { weekends: "always" } });
    const el = timetable.route!.render(ctx, new Scope(), new URLSearchParams({ date: "2026-10-07" }));
    await settle();
    expect(el.querySelector(".tt-dow")!.textContent).toBe("Sun");
  });
});
