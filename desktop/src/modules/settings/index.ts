import type { AppContext } from "@/core/app";
import { h, replace } from "@/core/dom";
import { icon } from "@/core/icons";
import { defineModule } from "@/core/module";
import type { Scope } from "@/core/reactive";
import { collectSections, matches, type Field, type SettingsSection } from "@/core/schema";
import { renderControl } from "./controls";
import "./settings.css";

/** The settings page. It knows nothing about individual settings: it
 * renders whatever sections the modules declare. */
export default defineModule({
  id: "settings",
  title: "Settings",
  icon: "settings",
  order: 90,
  route: {
    path: "/settings",
    render(ctx, scope, params) {
      const t = ctx.i18n.t.bind(ctx.i18n);
      const sections = collectSections(ctx);
      const search = h("input", {
        type: "search", class: "input search", placeholder: t("Search {n} settings…", { n: countFields(sections) }),
        value: params.get("q") ?? "", attrs: { "aria-label": t("Search settings") },
      });
      const index = h("nav", { class: "settings-index" });
      const body = h("div", { class: "settings-body" });

      let renderScope = scope.child();
      const render = () => {
        renderScope.dispose();
        renderScope = scope.child();
        const q = search.value;
        const visible = sections
          .map((s) => ({ s, fields: s.fields.filter((f) => matches(f, s, q, t) && (f.visibleIf?.(ctx.settings) ?? true)) }))
          .filter((x) => x.fields.length > 0);

        replace(
          index,
          visible.map(({ s }) =>
            h("a", {
              class: "settings-index-item", href: `#${s.id}`,
              onclick: (ev: MouseEvent) => {
                ev.preventDefault();
                body.querySelector(`#section-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
              },
            }, s.icon ? icon(s.icon, 16) : null, t(s.title)),
          ),
        );
        replace(
          body,
          visible.length
            ? visible.map(({ s, fields }) => section(ctx, renderScope, s, fields))
            : h("div", { class: "empty" }, t("No setting matches \"{q}\".", { q })),
        );
      };

      // Re-render when visibility conditions may have changed (e.g. the
      // data source switched), but keep focus inside inputs stable.
      let lastVisible = "";
      scope.watch(ctx.settings.document, () => {
        const key = ctx.i18n.lang + sections.flatMap((s) => s.fields.filter((f) => f.visibleIf?.(ctx.settings) ?? true).map((f) => f.key)).join();
        if (key !== lastVisible) {
          lastVisible = key;
          render();
        }
      });
      search.addEventListener("input", () => {
        render();
        ctx.router.setParams({ q: search.value || null });
      });

      return h(
        "div",
        { class: "page settings-page" },
        h("div", { class: "settings-toolbar" }, search, h("div", { class: "spacer" }), ...toolbar(ctx)),
        h("div", { class: "settings-layout" }, index, body),
      );
    },
  },
});

function countFields(sections: SettingsSection[]): number {
  return sections.reduce((n, s) => n + s.fields.length, 0);
}

function section(ctx: AppContext, scope: Scope, s: SettingsSection, fields: Field[]): HTMLElement {
  return h(
    "section",
    { class: "card settings-section", id: `section-${s.id}` },
    h("h2", { class: "card-title" }, s.icon ? icon(s.icon, 16) : null, ctx.i18n.t(s.title)),
    s.description ? h("p", { class: "muted small section-desc" }, ctx.i18n.t(s.description)) : null,
    fields.map((f) => fieldRow(ctx, scope, f)),
  );
}

function fieldRow(ctx: AppContext, scope: Scope, f: Field): HTMLElement {
  const reset = h("button", {
    type: "button", class: "icon-btn reset", title: ctx.i18n.t("Reset to default"), attrs: { "aria-label": ctx.i18n.t("Reset to default") },
    onclick: () => ctx.settings.reset(f.key),
  }, icon("undo", 14));
  scope.add(ctx.settings.watch(f.key, () => reset.classList.toggle("hidden", !ctx.settings.isSet(f.key))));

  const wide = f.type === "custom" ? f.wide !== false : f.type === "list" || (f.type === "text" && f.multiline);
  return h(
    "div",
    { class: ["setting", wide && "wide"], dataset: { key: f.key } },
    h(
      "div",
      { class: "setting-text" },
      h("label", { class: "setting-label", attrs: { for: `set-${f.key.replace(/\W/g, "-")}` } }, ctx.i18n.t(f.label)),
      f.description ? h("div", { class: "muted small" }, ctx.i18n.t(f.description)) : null,
    ),
    h("div", { class: "setting-control" }, renderControl(f, ctx, scope), reset),
  );
}

function toolbar(ctx: AppContext): HTMLElement[] {
  const t = ctx.i18n.t.bind(ctx.i18n);
  const fileInput = h("input", { type: "file", accept: "application/json,.json", class: "hidden" });
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const doc = JSON.parse(await file.text());
      if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new Error(t("not a settings object"));
      await ctx.settings.replace(doc);
      ctx.toasts.show("success", t("Settings imported"), file.name);
    } catch (err) {
      ctx.toasts.show("error", t("Import failed"), (err as Error).message);
    }
    fileInput.value = "";
  });

  const exportJSON = () => JSON.stringify(ctx.settings.document.get(), null, 2);
  return [
    h("button", { class: "btn", title: t("Copy all settings as JSON"), onclick: async () => {
      await navigator.clipboard.writeText(exportJSON());
      ctx.toasts.show("success", t("Settings copied to the clipboard"), undefined, 2000);
    } }, icon("download", 16), t("Copy JSON")),
    h("button", { class: "btn", title: t("Save all settings to a file"), onclick: () => {
      const a = h("a", {
        href: URL.createObjectURL(new Blob([exportJSON()], { type: "application/json" })),
        download: "untis-gui-settings.json",
      });
      a.click();
      URL.revokeObjectURL(a.href);
    } }, icon("download", 16), t("Export")),
    h("button", { class: "btn", onclick: () => fileInput.click() }, icon("upload", 16), t("Import")),
    h("button", { class: "btn danger", onclick: async () => {
      if (!confirm(t("Reset every setting to its default?"))) return;
      await ctx.settings.resetAll();
      ctx.toasts.show("success", t("All settings reset"), undefined, 2000);
    } }, icon("undo", 16), t("Reset all")),
    fileInput,
  ];
}
