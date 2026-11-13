import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api/client";
import type { UpdateStatus } from "./api/types";
import { createBus } from "./app";
import { UpdateService } from "./update";

const status = (over: Partial<UpdateStatus> = {}): UpdateStatus => ({
  current: "1.0.0", supported: true, enabled: true, state: "idle", kind: "web", checkedAt: null, ...over,
});

function setup(over: Partial<Record<keyof ApiClient, unknown>> = {}) {
  const api = {
    update: vi.fn(async () => status()),
    checkUpdate: vi.fn(async () => status({ state: "available", latest: "1.1.0" })),
    applyUpdate: vi.fn(async () => status({ state: "downloading", latest: "1.1.0" })),
    openUpdatePage: vi.fn(async () => status()),
    restartBackend: vi.fn(async () => status()),
    health: vi.fn(async () => ({ status: "ok", version: "1.1.0" })),
    ...over,
  } as unknown as ApiClient;
  const bus = createBus();
  return { api, bus, update: new UpdateService(api, bus) };
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe("UpdateService", () => {
  it("knows nothing until it is loaded, then mirrors the backend", async () => {
    const { update } = setup();
    expect(update.status.get()).toBeNull();
    await update.load();
    expect(update.status.get()?.state).toBe("idle");
  });

  it("stays empty with a backend that has no updater", async () => {
    const { update } = setup({ update: vi.fn(async () => { throw new Error("404"); }) });
    await expect(update.load()).resolves.toBeUndefined();
    expect(update.status.get()).toBeNull();
  });

  it("follows the backend's update events", () => {
    const { bus, update } = setup();
    bus.emit("update", status({ state: "downloading", latest: "1.1.0", size: 100, done: 40 }));
    expect(update.status.get()).toMatchObject({ state: "downloading", done: 40 });
    bus.emit("update", status({ state: "done", latest: "1.1.0", result: { action: "replace", restart: "app" } }));
    expect(update.status.get()?.result?.restart).toBe("app");
  });

  // An update that fails at once: its event arrives before the answer to
  // the click, which still says "downloading".
  it("does not let a late answer overwrite a newer event", async () => {
    let answer: (st: UpdateStatus) => void = () => {};
    const { bus, update } = setup({ applyUpdate: vi.fn(() => new Promise<UpdateStatus>((r) => (answer = r))) });
    bus.emit("update", status({ seq: 3, state: "available", latest: "1.1.0" }));
    const pressed = update.apply();
    bus.emit("update", status({ seq: 5, state: "failed", latest: "1.1.0", error: "no SHA256SUMS" }));
    answer(status({ seq: 4, state: "downloading", latest: "1.1.0" }));
    expect((await pressed).state).toBe("failed");
    expect(update.status.get()).toMatchObject({ state: "failed", error: "no SHA256SUMS" });

    // the same for the other requests
    const { bus: bus2, update: update2 } = setup({
      update: vi.fn(async () => status({ seq: 1 })),
      checkUpdate: vi.fn(async () => status({ seq: 2 })),
    });
    bus2.emit("update", status({ seq: 9, state: "available", latest: "1.1.0" }));
    await update2.load();
    await update2.check();
    expect(update2.status.get()?.state).toBe("available");
  });

  it("takes newer, equal and restarted states", async () => {
    const { bus, update } = setup();
    bus.emit("update", status({ seq: 5, state: "available", latest: "1.1.0" }));
    bus.emit("update", status({ seq: 5, state: "downloading", latest: "1.1.0" }));
    expect(update.status.get()?.state).toBe("downloading");
    bus.emit("update", status({ seq: 6, state: "done", latest: "1.1.0" }));
    expect(update.status.get()?.state).toBe("done");
    // a restarted backend counts from the start again, as another version
    bus.emit("update", status({ seq: 1, current: "1.1.0" }));
    expect(update.status.get()).toMatchObject({ current: "1.1.0", state: "idle" });
  });

  it("checks and applies only when asked", async () => {
    const { api, update } = setup();
    await update.load();
    expect(api.checkUpdate).not.toHaveBeenCalled();
    expect(api.applyUpdate).not.toHaveBeenCalled();
    expect((await update.check()).latest).toBe("1.1.0");
    expect(update.status.get()?.state).toBe("available");
    await update.apply();
    expect(api.applyUpdate).toHaveBeenCalledTimes(1);
    expect(update.status.get()?.state).toBe("downloading");
  });

  it("restarts the web edition and reloads once the new version answers", async () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    vi.stubGlobal("location", { ...location, reload });
    // the old version is still answering at first, then nothing, then the new one
    const health = vi
      .fn()
      .mockResolvedValueOnce({ status: "ok", version: "1.0.0" })
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockResolvedValue({ status: "ok", version: "1.1.0" });
    const { api, bus, update } = setup({ health });
    bus.emit("update", status({ state: "done", latest: "1.1.0", result: { action: "replace", restart: "server" } }));
    const done = update.restart();
    await vi.runAllTimersAsync();
    await done;
    expect(api.restartBackend).toHaveBeenCalledTimes(1);
    expect(health).toHaveBeenCalledTimes(3);
    expect(reload).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("gives up when the new version never answers", async () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    vi.stubGlobal("location", { ...location, reload });
    const { bus, update } = setup({ health: vi.fn(async () => ({ status: "ok", version: "1.0.0" })) });
    bus.emit("update", status({ state: "done", latest: "1.1.0", result: { action: "replace", restart: "server" } }));
    const done = update.restart().catch((err: Error) => err.message);
    await vi.runAllTimersAsync();
    expect(await done).toContain("did not start");
    expect(reload).not.toHaveBeenCalled();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not restart without an installed update", async () => {
    const { api, bus, update } = setup();
    await expect(update.restart()).rejects.toThrow("no installed update");
    bus.emit("update", status({ state: "available", latest: "1.1.0" }));
    await expect(update.restart()).rejects.toThrow("no installed update");
    bus.emit("update", status({ state: "done", latest: "1.1.0", result: { action: "save", file: "/x.deb" } }));
    await expect(update.restart()).rejects.toThrow("no installed update");
    bus.emit("update", status({ state: "done", latest: "1.1.0", result: { action: "replace", restart: "manual" } }));
    await expect(update.restart()).rejects.toThrow("no installed update");
    expect(api.restartBackend).not.toHaveBeenCalled();
  });

  it("leaves restarting the desktop app to the shell", async () => {
    const { api, bus, update } = setup();
    bus.emit("update", status({ kind: "appimage", state: "done", latest: "1.1.0", result: { action: "replace", restart: "app" } }));
    // in a plain browser there is no shell to ask
    await expect(update.restart()).rejects.toThrow("desktop app");
    expect(api.restartBackend).not.toHaveBeenCalled();
  });
});
