import type { UpdateStatus } from "@/core/api/types";
import type { AppContext } from "@/core/app";
import { h, replace } from "@/core/dom";
import { icon } from "@/core/icons";
import type { Scope } from "@/core/reactive";
import { openDialog } from "@/ui/dialog";

/**
 * The update button in the top bar. It exists only while there is
 * something to do: a newer release was found, a download is running, or
 * an update waits for its last step. Otherwise it is hidden entirely.
 *
 * Nothing is downloaded before the button is pressed.
 */
export function updateButton(ctx: AppContext, scope: Scope): HTMLElement {
  const t = ctx.i18n.t.bind(ctx.i18n);
  const label = h("span");
  const btn = h("button", { type: "button", class: "btn primary update-btn", hidden: true }, icon("download", 16), label);
  /** Set while this window asked for the update, so only it shows the outcome. */
  let pressed = false;
  let last: UpdateStatus["state"] | undefined;

  const render = () => {
    const st = ctx.update.status.get();
    const state = st?.state ?? "idle";
    btn.hidden = !st || state === "idle";
    btn.disabled = state === "downloading";
    btn.classList.toggle("busy", state === "downloading");
    if (!st || state === "idle") return;
    const version = st.latest ?? "";
    if (state === "downloading") {
      label.textContent = t("Downloading… {percent}%", { percent: percent(st) });
      btn.title = t("Downloading version {version}", { version });
    } else if (state === "done") {
      const restarts = st.result?.restart === "app" || st.result?.restart === "server";
      label.textContent = restarts ? t("Restart to update") : t("Finish the update");
      btn.title = t("Version {version} is ready", { version });
    } else {
      label.textContent = t("Update to {version}", { version });
      btn.title = hint(ctx, st);
    }
  };

  scope.watch(ctx.update.status, (st) => {
    render();
    const state = st?.state;
    // The outcome of an update this window started: show what to do next.
    if (pressed && last === "downloading" && st && (state === "done" || state === "failed")) {
      pressed = false;
      void showOutcome(ctx, st);
    }
    last = state;
  });
  scope.watch(ctx.settings.document, render, false); // language

  btn.addEventListener("click", async () => {
    const st = ctx.update.status.get();
    if (!st) return;
    if (st.state === "done") return void showOutcome(ctx, st);
    if (st.state !== "available" && st.state !== "failed") return;
    pressed = true;
    try {
      await ctx.update.apply();
      if (st.action === "page") {
        pressed = false;
        ctx.toasts.show("info", t("Release page opened"), t("Version {version} has no automatic update for this installation. Download it from the page that just opened in your browser.", { version: st.latest ?? "" }) + (st.url ? ` ${st.url}` : ""), 12000);
      }
    } catch (err) {
      pressed = false;
      ctx.toasts.show("error", t("The update could not be started"), (err as Error).message);
    }
  });
  return btn;
}

function percent(st: UpdateStatus): number {
  if (!st.size) return 0;
  return Math.min(100, Math.floor(((st.done ?? 0) / st.size) * 100));
}

/** What pressing the button will do, as its tooltip. */
function hint(ctx: AppContext, st: UpdateStatus): string {
  const t = ctx.i18n.t.bind(ctx.i18n);
  switch (st.action) {
    case "replace":
      return t("Downloads the new version and installs it. A restart finishes the update.");
    case "run":
      return t("Downloads the installer of the new version and opens it.");
    case "save":
      return t("Downloads the package of the new version. Installing it needs your package manager.");
    default:
      return t("Opens the release page in your browser.");
  }
}

/** Says what the update did and what is left to do. */
export function showOutcome(ctx: AppContext, st: UpdateStatus): Promise<void> {
  const t = ctx.i18n.t.bind(ctx.i18n);
  const version = st.latest ?? "";
  const close = (ev: Event) => (ev.currentTarget as HTMLElement).closest("dialog")?.close();
  const actions = h("div", { class: "dialog-actions" });
  const body = h("div", { class: "update-outcome" });
  const later = h("button", { type: "button", class: "btn", onclick: close }, t("Close"));

  if (st.state === "failed") {
    replace(
      body,
      h("p", null, t("Version {version} was not installed. Your current version is unchanged.", { version })),
      h("p", { class: "small muted" }, st.error ?? ""),
    );
    replace(
      actions,
      h("button", { type: "button", class: "btn", onclick: (ev: Event) => { close(ev); void ctx.update.openPage().catch(() => undefined); } }, t("Open the release page")),
      h("button", { type: "button", class: "btn primary", onclick: (ev: Event) => { close(ev); void retry(ctx); } }, t("Try again")),
    );
    return openDialog(t("The update failed"), h("div", null, body, actions));
  }

  const res = st.result;
  if (res?.action === "replace") {
    if (res.restart === "manual") {
      replace(body, h("p", null, t("Version {version} is installed. Close untisd and start it again to use it.", { version })));
      replace(actions, later);
    } else {
      const restart = h("button", { type: "button", class: "btn primary" }, t("Restart now"));
      restart.addEventListener("click", async () => {
        restart.disabled = true;
        restart.textContent = t("Restarting…");
        try {
          await ctx.update.restart();
        } catch (err) {
          restart.disabled = false;
          restart.textContent = t("Restart now");
          ctx.toasts.show("error", t("The restart did not work"), (err as Error).message, 0);
        }
      });
      replace(body, h("p", null, t("Version {version} is installed. Restart the app to use it.", { version })));
      replace(actions, h("button", { type: "button", class: "btn", onclick: close }, t("Later")), restart);
    }
  } else if (res?.action === "run") {
    replace(
      body,
      h("p", null, t("The installer of version {version} was downloaded and opened. Follow its steps; it may ask you to close this app.", { version })),
      h("p", { class: "small muted" }, res.file ?? ""),
    );
    replace(actions, later);
  } else if (res?.action === "save") {
    const command = res.command ?? "";
    const copy = h("button", { type: "button", class: "btn primary" }, t("Copy the command"));
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(command);
        copy.textContent = t("Copied");
      } catch {
        ctx.toasts.show("warning", t("Could not copy"), t("Select the command and copy it yourself."));
      }
    });
    replace(
      body,
      h("p", null, t("The package of version {version} was downloaded. Installing it needs administrator rights, so run this in a terminal:", { version })),
      h("pre", { class: "update-command" }, command),
      h("p", { class: "small muted" }, res.file ?? ""),
    );
    replace(actions, later, copy);
  } else {
    replace(body, h("p", null, t("Version {version} is ready", { version })));
    replace(actions, later);
  }
  return openDialog(t("Update to {version}", { version }), h("div", null, body, actions));
}

async function retry(ctx: AppContext): Promise<void> {
  try {
    await ctx.update.apply();
  } catch (err) {
    ctx.toasts.show("error", ctx.i18n.t("The update could not be started"), (err as Error).message);
  }
}
