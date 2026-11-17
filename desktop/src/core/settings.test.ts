import { describe, expect, it, vi } from "vitest";
import { ApiError, type ApiClient } from "./api/client";
import { SettingsStore, getPath, patchFor } from "./settings";

function fakeApi(initial: Record<string, unknown> = {}) {
  const patches: unknown[] = [];
  const api = {
    getSettings: vi.fn(async () => structuredClone(initial)),
    patchSettings: vi.fn(async (p: unknown) => {
      patches.push(p);
      return {};
    }),
  } as unknown as ApiClient;
  return { api, patches };
}

describe("path helpers", () => {
  it("reads nested values", () => {
    expect(getPath({ a: { b: 1 } }, "a.b")).toBe(1);
    expect(getPath({ a: 1 }, "a.b")).toBeUndefined();
  });
  it("builds merge patches", () => {
    expect(patchFor("a.b.c", 1)).toEqual({ a: { b: { c: 1 } } });
  });
});

describe("SettingsStore", () => {
  it("falls back to registered defaults", async () => {
    const { api } = fakeApi({ ui: { theme: "dark" } });
    const s = new SettingsStore(api);
    await s.load();
    s.registerDefault("ui.density", "cozy");
    expect(s.get("ui.theme")).toBe("dark");
    expect(s.get("ui.density")).toBe("cozy");
    expect(s.isSet("ui.density")).toBe(false);
  });

  it("applies writes locally and batches them into one patch", async () => {
    vi.useFakeTimers();
    const { api, patches } = fakeApi({ ui: { theme: "dark", accent: "#000" } });
    const s = new SettingsStore(api);
    await s.load();
    const seen = vi.fn();
    s.watch("ui.theme", seen);
    s.set("ui.theme", "light");
    s.reset("ui.accent");
    expect(s.get("ui.theme")).toBe("light");
    expect(s.isSet("ui.accent")).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    expect(patches).toEqual([{ ui: { theme: "light", accent: null } }]);
    expect(seen.mock.calls).toEqual([["dark"], ["light"]]);
    vi.useRealTimers();
  });

  it("keeps saving after a failed save, the failed change first", async () => {
    vi.useFakeTimers();
    const { api, patches } = fakeApi({});
    const patch = vi.mocked(api.patchSettings);
    patch.mockRejectedValueOnce(new Error("backend restarting"));
    const s = new SettingsStore(api);
    await s.load();

    s.set("a", 1);
    await vi.advanceTimersByTimeAsync(300); // the first PATCH fails
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patches).toEqual([]);

    s.set("b", 2); // a later change still reaches the backend, after the failed one
    await vi.advanceTimersByTimeAsync(300);
    expect(patches).toEqual([{ a: 1 }, { b: 2 }]);

    await vi.advanceTimersByTimeAsync(120_000);
    expect(patch).toHaveBeenCalledTimes(3); // nothing is sent twice
    vi.useRealTimers();
  });

  it("sends a failed change again on its own, with growing pauses, and reports it once", async () => {
    vi.useFakeTimers();
    const { api, patches } = fakeApi({});
    const patch = vi.mocked(api.patchSettings);
    patch.mockRejectedValueOnce(new Error("down")).mockRejectedValueOnce(new Error("still down"));
    const s = new SettingsStore(api);
    s.onSaveError = vi.fn();
    await s.load();

    s.set("a", 1);
    await vi.advanceTimersByTimeAsync(300); // attempt 1 fails, the next one is 2 s later
    await vi.advanceTimersByTimeAsync(1_000);
    expect(patch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_500); // attempt 2 fails, the next one is 4 s later
    expect(patch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(patch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_500); // attempt 3 works
    expect(patches).toEqual([{ a: 1 }]);
    expect(s.onSaveError).toHaveBeenCalledTimes(1);
    expect(s.onSaveError).toHaveBeenCalledWith(new Error("down"), true);

    await vi.advanceTimersByTimeAsync(120_000);
    expect(patch).toHaveBeenCalledTimes(3); // saved: no more attempts
    vi.useRealTimers();
  });

  it("reports again when another change cannot be saved either", async () => {
    vi.useFakeTimers();
    const { api } = fakeApi({});
    vi.mocked(api.patchSettings).mockRejectedValue(new Error("down"));
    const s = new SettingsStore(api);
    s.onSaveError = vi.fn();
    await s.load();

    s.set("a", 1);
    await vi.advanceTimersByTimeAsync(300); // fails: reported
    await vi.advanceTimersByTimeAsync(2_000); // the retry fails: not reported again
    expect(s.onSaveError).toHaveBeenCalledTimes(1);

    s.set("b", 2); // the user changes something else while saving does not work
    await vi.advanceTimersByTimeAsync(300);
    expect(s.onSaveError).toHaveBeenCalledTimes(2);
    expect(s.get("a")).toBe(1); // both stay visible and wait
    expect(s.get("b")).toBe(2);
    vi.useRealTimers();
  });

  it("never lets an older value overwrite a newer one after a failure", async () => {
    vi.useFakeTimers();
    const { api, patches } = fakeApi({});
    const patch = vi.mocked(api.patchSettings);
    let fail!: () => void;
    // the first PATCH hangs and then fails; meanwhile the value changes again
    patch.mockImplementationOnce(() => new Promise((_, reject) => (fail = () => reject(new Error("blip")))));
    const s = new SettingsStore(api);
    await s.load();

    s.set("a", 1);
    await vi.advanceTimersByTimeAsync(300);
    s.set("a", 2);
    await vi.advanceTimersByTimeAsync(300); // waits behind the hanging PATCH
    expect(patch).toHaveBeenCalledTimes(1);
    fail();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(patches).toEqual([{ a: 1 }, { a: 2 }]); // in the order they were made
    vi.useRealTimers();
  });

  it("keeps a reset and a later edit apart when the reset could not be saved", async () => {
    vi.useFakeTimers();
    const { api, patches } = fakeApi({ subj: { MATH: { name: "Mathe", hidden: true } } });
    vi.mocked(api.patchSettings).mockRejectedValueOnce(new Error("blip"));
    const s = new SettingsStore(api);
    await s.load();

    s.reset("subj.MATH");
    await vi.advanceTimersByTimeAsync(300); // fails
    s.set("subj.MATH.emoji", "x");
    await vi.advanceTimersByTimeAsync(300);
    // Merged into one patch ({MATH: {emoji}}) the reset would be gone and
    // the backend would keep name and hidden.
    expect(patches).toEqual([{ subj: { MATH: null } }, { subj: { MATH: { emoji: "x" } } }]);
    vi.useRealTimers();
  });

  it("rejects flush() when the save fails, and the next flush sends the change", async () => {
    const { api, patches } = fakeApi({});
    vi.mocked(api.patchSettings).mockRejectedValueOnce(new Error("disk full"));
    const s = new SettingsStore(api);
    await s.load();
    s.set("a", 1);
    await expect(s.flush()).rejects.toThrow("disk full");
    await s.flush();
    expect(patches).toEqual([{ a: 1 }]);
    await s.flush(); // nothing left: resolves without another request
    expect(api.patchSettings).toHaveBeenCalledTimes(2);
  });

  it("drops a change the backend refuses for good and keeps saving the others", async () => {
    vi.useFakeTimers();
    const { api, patches } = fakeApi({ css: "old" });
    const patch = vi.mocked(api.patchSettings);
    const tooLarge = new ApiError("bad-request", "request body too large", 400);
    patch.mockRejectedValueOnce(tooLarge);
    const s = new SettingsStore(api);
    s.onSaveError = vi.fn();
    await s.load();

    s.set("css", "x".repeat(100));
    await vi.advanceTimersByTimeAsync(300); // refused
    expect(s.onSaveError).toHaveBeenCalledWith(tooLarge, false);
    expect(s.get("css")).toBe("old"); // shows what is stored, not what was refused

    s.set("b", 2);
    await vi.advanceTimersByTimeAsync(300);
    expect(patches).toEqual([{ b: 2 }]); // not held back by the refused change

    await vi.advanceTimersByTimeAsync(120_000);
    expect(patch).toHaveBeenCalledTimes(2); // and the refused one is not sent again
    vi.useRealTimers();
  });

  it("does not reload over changes that still wait to be sent", async () => {
    const { api } = fakeApi({});
    vi.mocked(api.patchSettings).mockRejectedValueOnce(new Error("down"));
    const s = new SettingsStore(api);
    await s.load();
    s.set("a", 1);
    await expect(s.flush()).rejects.toThrow("down");

    await s.reload(); // e.g. another window changed something meanwhile
    expect(api.getSettings).toHaveBeenCalledTimes(1);
    expect(s.get("a")).toBe(1);

    await s.flush();
    await s.reload();
    expect(api.getSettings).toHaveBeenCalledTimes(2);
  });

  it("survives a listener that throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { api, patches } = fakeApi({});
    vi.mocked(api.patchSettings).mockRejectedValueOnce(new Error("down"));
    const s = new SettingsStore(api);
    s.onSaveError = () => {
      throw new Error("listener");
    };
    await s.load();
    s.set("a", 1);
    await expect(s.flush()).rejects.toThrow("down");
    await s.flush();
    expect(patches).toEqual([{ a: 1 }]);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});
