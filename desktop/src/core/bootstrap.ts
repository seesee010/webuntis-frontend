import type { ApiClient } from "./api/client";
import { createBus, type AppContext } from "./app";
import { DataService } from "./data";
import { Display } from "./display";
import { ModuleRegistry, type ModuleDef } from "./module";
import { Router } from "./router";
import { registerDefaults } from "./schema";
import { SettingsStore } from "./settings";
import { Toasts } from "./toasts";

/**
 * Wires all services together, registers the modules and loads the
 * settings. Used by main.ts and by the tests, so both run the same code.
 */
export async function createApp(api: ApiClient, modules: ModuleDef[]): Promise<AppContext> {
  const bus = createBus();
  const settings = new SettingsStore(api);
  const ctx: AppContext = {
    api,
    bus,
    settings,
    data: new DataService(api, bus),
    router: new Router(),
    modules: new ModuleRegistry(),
    toasts: new Toasts(),
    display: new Display(settings),
  };
  ctx.modules.register(...modules);
  registerDefaults(ctx);
  await settings.load();
  bus.on("settings-changed", () => void settings.reload());
  return ctx;
}

/** Runs the modules' setup hooks; returns a function undoing them. */
export function setupModules(ctx: AppContext): () => void {
  const cleanups = ctx.modules.all().map((m) => m.setup?.(ctx));
  return () => cleanups.forEach((c) => c?.());
}
