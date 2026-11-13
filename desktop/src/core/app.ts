import type { ApiClient } from "./api/client";
import type { Change, UpdateStatus } from "./api/types";
import { Bus } from "./bus";
import type { DataService } from "./data";
import type { Display } from "./display";
import type { I18n } from "./i18n";
import type { ModuleRegistry } from "./module";
import type { Router } from "./router";
import type { SettingsStore } from "./settings";
import type { Toasts } from "./toasts";
import type { UpdateService } from "./update";

/** Events modules can emit and listen to. Extend through declaration
 * merging when a module introduces its own events. */
export interface AppEvents extends Record<string, unknown> {
  changes: Change[];
  "settings-changed": undefined;
  /** The updater's state changed (a release was found, progress, result). */
  update: UpdateStatus;
}

/**
 * Everything a module gets access to. Services are added here as the
 * app grows (theme, i18n, commands, ...); modules never construct them.
 */
export interface AppContext {
  api: ApiClient;
  bus: Bus<AppEvents>;
  data: DataService;
  settings: SettingsStore;
  router: Router;
  modules: ModuleRegistry;
  toasts: Toasts;
  display: Display;
  i18n: I18n;
  update: UpdateService;
}

export function createBus(): Bus<AppEvents> {
  return new Bus<AppEvents>();
}
