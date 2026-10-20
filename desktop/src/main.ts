import "./styles/base.css";
import { ApiClient, discoverConnection } from "./core/api/client";
import { createBus, type AppContext } from "./core/app";
import { DataService } from "./core/data";
import { Display } from "./core/display";
import { h, replace } from "./core/dom";
import { ModuleRegistry } from "./core/module";
import { Router } from "./core/router";
import { SettingsStore } from "./core/settings";
import { Toasts } from "./core/toasts";
import { registerDefaults } from "./core/schema";
import { modules } from "./modules";
import { mountShell } from "./shell/shell";

async function boot(root: HTMLElement): Promise<void> {
  replace(root, h("div", { class: "splash" }, h("div", { class: "spinner" }), "Starting…"));

  const api = new ApiClient(await discoverConnection());
  const bus = createBus();
  const settings = new SettingsStore(api);
  const ctx: AppContext = {
    api,
    bus,
    data: new DataService(api, bus),
    settings,
    router: new Router(),
    modules: new ModuleRegistry(),
    toasts: new Toasts(),
    display: new Display(settings),
  };
  ctx.modules.register(...modules);
  registerDefaults(ctx);
  await ctx.settings.load();
  bus.on("settings-changed", () => void ctx.settings.reload());

  for (const m of ctx.modules.all()) m.setup?.(ctx);
  mountShell(root, ctx);
  ctx.data.start();
  window.addEventListener("beforeunload", () => void ctx.settings.flush());
}

const root = document.getElementById("app")!;
boot(root).catch((err: Error) => {
  console.error(err);
  replace(
    root,
    h(
      "div",
      { class: "splash" },
      h("strong", null, "Could not reach the untis backend"),
      h("div", { class: "muted small" }, err.message),
      h("div", { class: "muted small" }, "In a browser, start it with: cd backend && go run ./cmd/untisd -dev"),
      h("button", { class: "btn", onclick: () => location.reload() }, "Retry"),
    ),
  );
});
