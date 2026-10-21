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

      const render = () => {
        const st = ctx.data.status.get();
        const ov = ctx.data.overview.get();
        replace(
          body,
          row("Backend", st ? `untisd ${st.version}` : null),
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
      scope.watch(ctx.settings.document, render, false);
      void ctx.data.loadStatus();
      return h("div", { class: "page narrow" }, body);
    },
  },
});
