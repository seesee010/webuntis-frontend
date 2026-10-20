// A real AppContext wired to a fake API, for view smoke tests.
import { vi } from "vitest";
import type { ApiClient } from "@/core/api/client";
import type { Snapshot } from "@/core/api/types";
import { createBus, type AppContext } from "@/core/app";
import { DataService } from "@/core/data";
import { Display } from "@/core/display";
import { ModuleRegistry, type ModuleDef } from "@/core/module";
import { Router } from "@/core/router";
import { registerDefaults } from "@/core/schema";
import { SettingsStore } from "@/core/settings";
import { Toasts } from "@/core/toasts";

export async function testContext(snap: Snapshot, modules: ModuleDef[], settings: Record<string, unknown> = {}): Promise<AppContext> {
  const api = {
    getSettings: vi.fn(async () => settings),
    patchSettings: vi.fn(async () => ({})),
    snapshot: vi.fn(async () => snap),
    overview: vi.fn(async () => snap),
    status: vi.fn(async () => null),
    who: vi.fn(async () => []),
    events: vi.fn(() => () => {}),
  } as unknown as ApiClient;
  const bus = createBus();
  const store = new SettingsStore(api);
  const ctx: AppContext = {
    api, bus, settings: store, data: new DataService(api, bus), router: new Router(),
    modules: new ModuleRegistry(), toasts: new Toasts(), display: new Display(store),
  };
  ctx.modules.register(...modules);
  registerDefaults(ctx);
  await store.load();
  return ctx;
}

/** Waits for pending promises (data loads) to settle. */
export const settle = () => new Promise((r) => setTimeout(r, 0));
