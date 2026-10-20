import "./styles/base.css";
import { ApiClient, discoverConnection } from "./core/api/client";
import { createApp, setupModules } from "./core/bootstrap";
import { h, replace } from "./core/dom";
import { modules } from "./modules";
import { mountShell } from "./shell/shell";

async function boot(root: HTMLElement): Promise<void> {
  replace(root, h("div", { class: "splash" }, h("div", { class: "spinner" }), "Starting…"));
  const ctx = await createApp(new ApiClient(await discoverConnection()), modules);
  setupModules(ctx);
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
