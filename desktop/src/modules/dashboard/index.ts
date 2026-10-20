import type { AppContext } from "@/core/app";
import { h, replace } from "@/core/dom";
import { icon } from "@/core/icons";
import { defineModule } from "@/core/module";
import type { Scope } from "@/core/reactive";
import { allWidgets, resolveLayout, type WidgetSlot } from "@/core/widgets";
import { openDialog } from "@/ui/dialog";
import { layoutEditor } from "./layout-editor";
import { timetableWidgets } from "./widgets";
import "./dashboard.css";

export default defineModule({
  id: "dashboard",
  title: "Dashboard",
  icon: "dashboard",
  order: 10,
  route: { path: "/dashboard", render: renderDashboard },
  widgets: timetableWidgets,
  settings: [
    {
      id: "dashboard",
      title: "Dashboard",
      icon: "dashboard",
      order: 15,
      fields: [
        { key: "dashboard.layout", type: "custom", label: "Widgets", description: "Choose, order and size the dashboard widgets.", default: null, render: layoutEditor },
        { key: "dashboard.columns", type: "range", label: "Columns", description: "Grid columns on wide windows.", default: 3, min: 1, max: 6 },
        { key: "dashboard.greeting", type: "toggle", label: "Greeting", default: true },
        { key: "dashboard.showName", type: "toggle", label: "Use my name in the greeting", default: true, visibleIf: (s) => s.get("dashboard.greeting") === true },
        { key: "dashboard.dayProgress", type: "toggle", label: "Day progress", description: "Show how many lessons are done today.", default: true },
        { key: "dashboard.agendaAdvance", type: "toggle", label: "Agenda jumps ahead", description: "After school, show the next school day.", default: true },
        { key: "dashboard.changesDays", type: "number", label: "Changes look-ahead", default: 7, min: 1, max: 60, unit: "days" },
      ],
    },
  ],
});

function greeting(ctx: AppContext): string {
  const hour = new Date().getHours();
  const base = hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const user = ctx.data.overview.get()?.meta.user;
  const first = user?.split(/[\s,]+/)[0];
  return ctx.settings.get<boolean>("dashboard.showName") && first ? `${base}, ${first}` : base;
}

function renderDashboard(ctx: AppContext, scope: Scope): HTMLElement {
  const head = h("div", { class: "dash-head" });
  const grid = h("div", { class: "dash-grid" });
  const customise = h("button", { class: "btn", onclick: () => void openDialog("Customise dashboard", layoutEditor(ctx, scope.child()), { wide: true }) }, icon("settings", 16), "Customise");

  let gridScope = scope.child();
  let key = "";
  const render = () => {
    const slots = resolveLayout(allWidgets(ctx), ctx.settings.get<WidgetSlot[] | null>("dashboard.layout") ?? undefined);
    const k = JSON.stringify(slots);
    grid.style.setProperty("--dash-cols", String(ctx.settings.get<number>("dashboard.columns")));
    if (k === key) return;
    key = k;
    gridScope.dispose();
    gridScope = scope.child();
    const widgets = allWidgets(ctx);
    const shown = slots.filter((s) => s.enabled);
    replace(
      grid,
      shown.length
        ? shown.map((s) => {
            const w = widgets.find((x) => x.id === s.id)!;
            let body: HTMLElement;
            try {
              body = w.render(ctx, gridScope.child());
            } catch (err) {
              body = h("div", { class: "muted small" }, `Widget failed: ${(err as Error).message}`);
            }
            return h("section", { class: ["card", "widget", `size-${s.size}`], dataset: { widget: w.id } }, h("h2", { class: "card-title" }, icon(w.icon, 16), w.title), body);
          })
        : h("div", { class: "card empty" }, "All widgets are hidden. Use Customise to show some."),
    );
  };
  scope.watch(ctx.settings.document, () => {
    render();
    replace(head, ctx.settings.get("dashboard.greeting") ? h("h2", { class: "dash-greeting" }, greeting(ctx)) : h("div"), h("div", { class: "spacer" }), customise);
  });
  scope.watch(ctx.data.overview, () => {
    if (ctx.settings.get("dashboard.greeting")) head.querySelector(".dash-greeting")?.replaceChildren(greeting(ctx));
  });
  return h("div", { class: "page" }, head, grid);
}
