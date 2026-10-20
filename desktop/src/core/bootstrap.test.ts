import { describe, expect, it, vi } from "vitest";
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
});
