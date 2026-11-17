import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./api/client";
import { createApp, setupModules } from "./bootstrap";
import { defineModule } from "./module";
import { fakeApi } from "@/test/ctx";
import { snapshot } from "@/test/fixtures";

describe("createApp", () => {
  it("registers modules and their defaults, loads settings and runs setup hooks", async () => {
    const undo = vi.fn();
    const setup = vi.fn(() => undo);
    const mod = defineModule({
      id: "m", title: "M", icon: "info", setup,
      settings: [{ id: "s", title: "S", fields: [{ key: "m.flag", type: "toggle", label: "Flag", default: true }] }],
    });
    const api = fakeApi(snapshot(), { m: { other: 1 } });
    const ctx = await createApp(api, [mod]);
    expect(ctx.modules.get("m")).toBe(mod);
    expect(ctx.settings.get("m.flag")).toBe(true);
    expect(ctx.settings.get("m.other")).toBe(1);

    const teardown = setupModules(ctx);
    expect(setup).toHaveBeenCalledWith(ctx);
    teardown();
    expect(undo).toHaveBeenCalled();

    ctx.bus.emit("settings-changed", undefined);
    expect(api.getSettings).toHaveBeenCalledTimes(2);
  });

  it("tells the user when settings cannot be saved", async () => {
    vi.useFakeTimers();
    const api = fakeApi(snapshot(), { ui: { language: "de" } });
    vi.mocked(api.patchSettings)
      .mockRejectedValueOnce(new ApiError("network", "backend not reachable: boom"))
      .mockRejectedValueOnce(new ApiError("bad-request", "request body too large", 400));
    const ctx = await createApp(api, []);
    const toasts = () => ctx.toasts.items.get().map((t) => [t.kind, t.title, t.body]);

    ctx.settings.set("a", 1);
    await vi.advanceTimersByTimeAsync(300); // no answer: kept and tried again
    expect(toasts()).toEqual([
      ["warning", "Einstellungen konnten nicht gespeichert werden, neuer Versuch folgt", "backend not reachable: boom"],
    ]);

    await vi.advanceTimersByTimeAsync(2_000); // the next attempt is refused for good
    expect(toasts()).toContainEqual(
      ["error", "Eine Änderung der Einstellungen wurde abgelehnt und nicht gespeichert", "request body too large"],
    );
    vi.useRealTimers();
  });
});
