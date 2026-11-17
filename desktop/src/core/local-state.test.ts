import { describe, expect, it, vi } from "vitest";
import { addDays, today } from "./dates";
import { IdSet } from "./local-state";
import { testContext } from "@/test/ctx";
import { snapshot } from "@/test/fixtures";

describe("IdSet", () => {
  it("stores marks in the settings document", async () => {
    const ctx = await testContext(snapshot(), []);
    const t = today();
    const done = new IdSet(ctx.settings, "state.test.done");
    done.toggle("a");
    done.set("b", true, addDays(t, 10)); // a future item keeps its own date
    done.set("b", true, addDays(t, 10));
    done.set("c", true, "2020-01-01"); // a past one gets the day it was marked
    expect(ctx.settings.get("state.test.done")).toEqual([
      { id: "a", date: t },
      { id: "b", date: addDays(t, 10) },
      { id: "c", date: t },
    ]);
    done.toggle("a");
    expect(done.has("a")).toBe(false);
    expect(done.has("b")).toBe(true);
  });

  it("keeps the marks of missing items: failed section, sample data, a smaller window", async () => {
    const ctx = await testContext(snapshot(), []);
    const done = new IdSet(ctx.settings, "state.test.done");
    done.set("a", true);
    done.set("b", true);
    done.prune([]); // the list is empty for one of many reasons
    done.prune(["sample-1"]); // other data is shown
    expect(done.has("a")).toBe(true);
    expect(done.has("b")).toBe(true);
  });

  it("drops a mark only when its item has been gone longer than any window", async () => {
    const ctx = await testContext(snapshot(), []);
    const t = today();
    ctx.settings.set("state.test.done", [
      { id: "gone", date: addDays(t, -401) },
      { id: "recent", date: addDays(t, -399) },
      { id: "still-there", date: addDays(t, -500) },
    ]);
    new IdSet(ctx.settings, "state.test.done").prune(["still-there"]);
    expect(ctx.settings.get("state.test.done")).toEqual([
      { id: "recent", date: addDays(t, -399) },
      { id: "still-there", date: t }, // seen now, so its date is refreshed
    ]);
  });

  it("only writes when something changes", async () => {
    const ctx = await testContext(snapshot(), []);
    ctx.settings.set("state.test.done", [{ id: "a", date: addDays(today(), -5) }]);
    const set = vi.spyOn(ctx.settings, "set");
    const done = new IdSet(ctx.settings, "state.test.done");
    done.prune(["a"]); // seen 5 days ago: no refresh needed yet
    done.prune([]);
    expect(set).not.toHaveBeenCalled();
  });

  it("reads the old format of plain ids and converts it once", async () => {
    const ctx = await testContext(snapshot(), [], { state: { test: { done: ["a", "b", 7, null], bad: "oops" } } });
    const done = new IdSet(ctx.settings, "state.test.done");
    expect(done.has("a")).toBe(true);
    done.prune([]); // nothing is dropped, the list is written in the new format
    expect(ctx.settings.get("state.test.done")).toEqual([
      { id: "a", date: today() },
      { id: "b", date: today() },
    ]);

    const bad = new IdSet(ctx.settings, "state.test.bad"); // not a list at all
    expect(bad.has("x")).toBe(false);
    bad.set("x", true);
    expect(bad.has("x")).toBe(true);
  });
});
