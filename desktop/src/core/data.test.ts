import { describe, expect, it, vi } from "vitest";
import { ApiError, type ApiClient } from "./api/client";
import type { BackendEvent } from "./api/types";
import { createBus } from "./app";
import { DataService } from "./data";
import { snapshot } from "@/test/fixtures";

function setup(over: Partial<Record<keyof ApiClient, unknown>> = {}) {
  let emit: (ev: BackendEvent) => void = () => {};
  const api = {
    overview: vi.fn(async () => snapshot()),
    status: vi.fn(async () => ({ version: "t" })),
    snapshot: vi.fn(async () => snapshot()),
    refresh: vi.fn(async () => ({ snapshot: snapshot(), changes: [{ kind: "cancelled" }] })),
    events: vi.fn((fn: (ev: BackendEvent) => void, state: (c: boolean) => void) => {
      emit = fn;
      state(true);
      return () => {};
    }),
    ...over,
  } as unknown as ApiClient;
  const bus = createBus();
  const data = new DataService(api, bus);
  return { api, bus, data, emit: (ev: BackendEvent) => emit(ev) };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A snapshot told apart by its provider name. */
const from = (provider: string) => snapshot({ meta: { ...snapshot().meta, provider } });

/** An api.overview that answers each call only when the test says so. */
function controlledOverview() {
  const calls: ReturnType<typeof deferred<ReturnType<typeof snapshot>>>[] = [];
  const overview = vi.fn(() => {
    const d = deferred<ReturnType<typeof snapshot>>();
    calls.push(d);
    return d.promise;
  });
  return { overview, calls };
}

describe("DataService", () => {
  it("loads overview and status on start and tracks the connection", async () => {
    const { data } = setup();
    data.start();
    await tick();
    expect(data.overview.get()?.lessons.length).toBeGreaterThan(0);
    expect(data.status.get()?.version).toBe("t");
    expect(data.connected.get()).toBe(true);
  });

  it("caches windows until the next snapshot event", async () => {
    const { api, data, emit } = setup();
    data.start();
    await data.window("2026-10-05", "2026-10-11");
    await data.window("2026-10-05", "2026-10-11");
    expect(api.snapshot).toHaveBeenCalledTimes(1);
    const rev = data.revision.get();
    emit({ type: "snapshot", at: "" });
    expect(data.revision.get()).toBe(rev + 1);
    await data.window("2026-10-05", "2026-10-11");
    expect(api.snapshot).toHaveBeenCalledTimes(2);
  });

  it("reloads the service status after a background refresh", async () => {
    // the status page shows lastRefresh/nextRefresh/lastError, which a
    // background refresh changes without any other event
    let st = { version: "t", service: { lastRefresh: "2026-10-07T08:00:00Z" } };
    const { api, data, emit } = setup({ status: vi.fn(async () => structuredClone(st)) });
    data.start();
    await tick();
    expect(data.status.get()?.service.lastRefresh).toBe("2026-10-07T08:00:00Z");

    st = { version: "t", service: { lastRefresh: "2026-10-07T09:00:00Z" } };
    emit({ type: "snapshot", at: "" });
    await tick();
    expect(api.status).toHaveBeenCalledTimes(2);
    expect(data.status.get()?.service.lastRefresh).toBe("2026-10-07T09:00:00Z");
  });

  it("forwards update events to the bus", () => {
    const { bus, data, emit } = setup();
    const seen = vi.fn();
    bus.on("update", seen);
    data.start();
    emit({ type: "update", at: "", data: { state: "available", latest: "1.1.0" } });
    expect(seen).toHaveBeenCalledWith({ state: "available", latest: "1.1.0" });
  });

  it("forwards change events to the bus", () => {
    const { bus, data, emit } = setup();
    const seen = vi.fn();
    bus.on("changes", seen);
    data.start();
    emit({ type: "changes", at: "", data: [{ kind: "cancelled" }] });
    expect(seen).toHaveBeenCalledWith([{ kind: "cancelled" }]);
  });

  it("keeps errors as ErrorInfo and clears them on success", async () => {
    let fail = true;
    const { data } = setup({
      overview: vi.fn(async () => {
        if (fail) throw new ApiError("login", "bad password", 403);
        return snapshot();
      }),
    });
    await data.loadOverview();
    expect(data.error.get()).toEqual({ kind: "login", message: "bad password" });
    fail = false;
    await data.loadOverview();
    expect(data.error.get()).toBeNull();
  });

  it("refresh returns the detected changes", async () => {
    const { data } = setup();
    expect(await data.refresh()).toEqual([{ kind: "cancelled" }]);
    expect(data.loading.get()).toBe(false);
  });

  it("never lets an older overview answer replace a newer one", async () => {
    const { overview, calls } = controlledOverview();
    const { data } = setup({ overview });
    const first = data.loadOverview();
    const second = data.loadOverview();
    calls[1].resolve(from("new"));
    await second;
    calls[0].resolve(from("old")); // the slow first answer arrives last
    await first;
    expect(data.overview.get()?.meta.provider).toBe("new");
  });

  it("still shows an older answer while the newer one is outstanding", async () => {
    const { overview, calls } = controlledOverview();
    const { data } = setup({ overview });
    const first = data.loadOverview();
    void data.loadOverview();
    calls[0].resolve(from("old"));
    await first;
    expect(data.overview.get()?.meta.provider).toBe("old"); // better than nothing
    calls[1].resolve(from("new"));
    await tick();
    expect(data.overview.get()?.meta.provider).toBe("new");
  });

  it("drops answers to loads started before a provider switch", async () => {
    const { overview, calls } = controlledOverview();
    const { data, emit } = setup({ overview });
    data.start(); // loads the sample overview
    emit({ type: "provider", at: "" }); // the user switches to the CLI meanwhile
    calls[0].resolve(from("sample"));
    await tick();
    expect(data.overview.get()).toBeNull();

    emit({ type: "snapshot", at: "" }); // the CLI's first refresh is done
    calls[1].resolve(from("cli"));
    await tick();
    expect(data.overview.get()?.meta.provider).toBe("cli");
  });

  it("does not let a load started before the refresh button overwrite its result", async () => {
    const { overview, calls } = controlledOverview();
    const { data } = setup({ overview, refresh: vi.fn(async () => ({ snapshot: from("refreshed"), changes: [] })) });
    const load = data.loadOverview();
    await data.refresh();
    calls[0].resolve(from("before"));
    await load;
    expect(data.overview.get()?.meta.provider).toBe("refreshed");
  });

  it("does not let an older failure hide a newer success", async () => {
    const { overview, calls } = controlledOverview();
    const { data } = setup({ overview });
    const first = data.loadOverview();
    const second = data.loadOverview();
    calls[1].resolve(from("new"));
    await second;
    calls[0].reject(new ApiError("unreachable", "timeout", 502));
    await first;
    expect(data.error.get()).toBeNull();
    expect(data.overview.get()?.meta.provider).toBe("new");
  });

  it("keeps loading on until every load is done", async () => {
    const { overview, calls } = controlledOverview();
    const { data } = setup({ overview });
    const first = data.loadOverview();
    const second = data.loadOverview();
    calls[1].resolve(from("new"));
    await second;
    expect(data.loading.get()).toBe(true);
    calls[0].resolve(from("old"));
    await first;
    expect(data.loading.get()).toBe(false);
  });

  it("keeps the newer cached window when a request from before a snapshot event fails", async () => {
    const slow = deferred<ReturnType<typeof snapshot>>();
    const snapshotFn = vi.fn().mockReturnValueOnce(slow.promise).mockResolvedValue(snapshot());
    const { data, emit } = setup({ snapshot: snapshotFn });
    data.start();
    const old = data.window("2026-10-05", "2026-10-11");
    emit({ type: "snapshot", at: "" }); // the cache is cleared, the view asks again
    await data.window("2026-10-05", "2026-10-11");
    slow.reject(new ApiError("unreachable", "timeout", 502)); // the old request fails late
    await expect(old).rejects.toThrow("timeout");
    await data.window("2026-10-05", "2026-10-11");
    expect(snapshotFn).toHaveBeenCalledTimes(2); // the newer entry is still cached
  });
});
