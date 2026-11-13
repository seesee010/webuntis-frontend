import { defineModule } from "@/core/module";
import { h, replace } from "@/core/dom";

/** Diagnostics: where the data comes from and how fresh it is. */
export default defineModule({
  id: "status",
  title: "Status",
  icon: "activity",
  order: 95,
  route: {
    path: "/status",
    render(ctx, scope) {
      const body = h("div", { class: "card" });
      const t = ctx.i18n.t.bind(ctx.i18n);
      const row = (k: string, v: string | null | undefined) =>
        h("div", { class: "kv" }, h("span", { class: "muted" }, t(k)), h("span", null, v || "–"));
      const fmt = (s: string | null | undefined) => (s ? ctx.i18n.dateTime(s) : null);

      // Updates: what is known, and a way to look right now.
      const check = h("button", { type: "button", class: "btn small" }, t("Check now"));
      check.addEventListener("click", async () => {
        check.disabled = true;
        try {
          const up = await ctx.update.check();
          if (up.checkError) ctx.toasts.show("warning", t("Could not check for updates"), up.checkError);
          else if (up.state === "idle") ctx.toasts.show("success", t("Up to date"), t("Version {version} is the newest release.", { version: up.current }), 3000);
        } catch (err) {
          ctx.toasts.show("error", t("Could not check for updates"), (err as Error).message);
        } finally {
          check.disabled = false;
        }
      });
      const updates = () => {
        const up = ctx.update.status.get();
        if (!up) return null;
        const version = up.latest ?? "";
        let text: string;
        if (!up.supported) text = t("Not available for this build");
        else if (up.state === "downloading") text = t("Downloading version {version}", { version });
        else if (up.state === "done") text = t("Version {version} is ready", { version });
        else if (up.state === "available" || up.state === "failed") text = t("Version {version} is available", { version });
        else if (up.checkedAt && !up.checkError) text = t("Up to date");
        else text = up.enabled ? t("Not checked yet") : t("Automatic checks are off");
        const checked = up.checkedAt ? (up.checkError ? `${fmt(up.checkedAt)} – ${up.checkError}` : fmt(up.checkedAt)) : null;
        return [
          h("div", { class: "kv" }, h("span", { class: "muted" }, t("Updates")), h("span", { class: "row-inline" }, text, up.supported ? check : null)),
          up.supported ? row("Last update check", checked) : null,
        ];
      };

      const render = () => {
        const st = ctx.data.status.get();
        const ov = ctx.data.overview.get();
        replace(
          body,
          row("Backend", st ? `untisd ${st.version}` : null),
          updates(),
          row("Connection", t(ctx.data.connected.get() ? "live event stream" : "disconnected")),
          row("Data source", t(st?.service.provider === "cli" ? "untis CLI" : "Sample data")),
          st?.service.provider === "cli" ? row("CLI version", st.cliVersion ?? st.cliError?.message) : null,
          row("Last refresh", fmt(st?.service.lastRefresh)),
          row("Next refresh", fmt(st?.service.nextRefresh)),
          row("Last error", st?.service.lastError?.message),
          row("Overview window", ov ? `${ctx.i18n.date(ov.meta.from)} – ${ctx.i18n.date(ov.meta.to)}` : null),
          row("School", ov?.meta.school),
          row("Settings file", st?.settingsPath),
          ov && Object.keys(ov.errors).length
            ? row("Section errors", Object.entries(ov.errors).map(([k, v]) => `${k}: ${v}`).join("; "))
            : null,
        );
      };
      scope.watch(ctx.data.status, render);
      scope.watch(ctx.data.overview, render);
      scope.watch(ctx.data.connected, render);
      scope.watch(ctx.update.status, render, false);
      scope.watch(ctx.settings.document, render, false);
      void ctx.data.loadStatus();
      void ctx.update.load();
      return h("div", { class: "page narrow" }, body);
    },
  },
});
