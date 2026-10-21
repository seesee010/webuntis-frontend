import type { AppContext } from "@/core/app";
import type { Absence, Period } from "@/core/api/types";
import { h, replace } from "@/core/dom";
import { defineModule } from "@/core/module";
import type { Scope } from "@/core/reactive";
import { live } from "@/modules/dashboard/widgets";
import { missedLessons, totals, type AbsenceTotals } from "./logic";

function opt<T>(ctx: AppContext, key: string): T {
  return ctx.settings.get<T>(`absences.${key}`);
}

function select(ctx: AppContext, list: Absence[]): Absence[] {
  const out = opt<boolean>(ctx, "onlyUnexcused") ? list.filter((a) => !a.excused) : [...list];
  const dir = opt<string>(ctx, "sort") === "newest" ? -1 : 1;
  return out.sort((a, b) => dir * (a.startDate + (a.startTime ?? "")).localeCompare(b.startDate + (b.startTime ?? "")));
}

function totalsView(ctx: AppContext, t: AbsenceTotals): HTMLElement {
  const stat = (n: number, label: string, cls = "") => h("div", { class: "stat" }, h("div", { class: ["stat-n", cls] }, String(n)), h("div", { class: "muted small" }, ctx.i18n.t(label)));
  return h("div", { class: "stats four" }, stat(t.count, "absences"), stat(t.days, "school days"), stat(t.lessons, "lessons"), stat(t.unexcused, "not excused", t.unexcused ? "bad" : ""));
}

function absenceRow(ctx: AppContext, a: Absence, grid: Period[]): HTMLElement {
  const i = ctx.i18n;
  const span = a.startDate === a.endDate ? i.date(a.startDate, "weekdayDay") : `${i.date(a.startDate, "weekdayDay")} – ${i.date(a.endDate, "weekdayDay")}`;
  const lessons = missedLessons(a, grid);
  return h(
    "div",
    { class: ["list-row", !a.excused && "unexcused"], dataset: { id: a.id } },
    h("div", { class: "list-date" }, h("strong", null, span), a.startTime ? h("span", { class: "muted small" }, i.timeRange(a.startTime, a.endTime)) : null),
    h(
      "div",
      { class: "list-main" },
      h("div", null, h("strong", null, a.reason || i.t("Absence")), grid.length ? h("span", { class: "muted small" }, ` · ${i.plural(lessons, "{n} lesson", "{n} lessons")}`) : null),
      opt<boolean>(ctx, "showText") && a.text ? h("div", { class: "muted small" }, a.text) : null,
      opt<boolean>(ctx, "showText") && a.excuseText ? h("div", { class: "muted small" }, i.t("Excuse: {text}", { text: a.excuseText })) : null,
    ),
    h("span", { class: ["chip", a.excused ? "chip-ok" : "chip-bad"] }, a.excused ? i.t("excused") : a.excuseStatus ? i.t(a.excuseStatus) : i.t("not excused")),
  );
}

function renderAbsences(ctx: AppContext, scope: Scope): HTMLElement {
  const body = h("div", { class: "list-page" });
  const render = () => {
    const snap = ctx.data.overview.get();
    if (!snap) return replace(body, h("div", { class: "skeleton" }));
    const list = select(ctx, snap.absences);
    replace(
      body,
      h("section", { class: "card" }, h("h2", { class: "card-title" }, ctx.i18n.t("Totals")), totalsView(ctx, totals(snap.absences, snap.timeGrid))),
      h(
        "section",
        { class: "card" },
        h("h2", { class: "card-title" }, ctx.i18n.t("Absences")),
        list.length ? list.map((a) => absenceRow(ctx, a, snap.timeGrid)) : h("div", { class: "empty" }, ctx.i18n.t("No absences in the loaded period.")),
      ),
      snap.errors.absences ? h("div", { class: "muted small" }, ctx.i18n.t("Absences could not be loaded: {error}", { error: snap.errors.absences })) : null,
      h("div", { class: "muted small" }, ctx.i18n.t("Covers {from} – {to}; change the history under Settings › Data source.", { from: ctx.i18n.date(snap.meta.from), to: ctx.i18n.date(snap.meta.to) })),
    );
  };
  scope.watch(ctx.data.overview, render);
  scope.watch(ctx.settings.document, render, false);
  return h("div", { class: "page narrow" }, body);
}

export default defineModule({
  id: "absences",
  title: "Absences",
  icon: "absence",
  order: 50,
  route: { path: "/absences", key: "g a", render: renderAbsences },
  widgets: [
    {
      id: "absence-totals",
      title: "Absences",
      icon: "absence",
      size: "small",
      enabledByDefault: false,
      render: (ctx, scope) => live(ctx, scope, (snap) => totalsView(ctx, totals(snap.absences, snap.timeGrid))),
    },
  ],
  settings: [
    {
      id: "absences",
      title: "Absences",
      icon: "absence",
      order: 50,
      fields: [
        { key: "absences.sort", type: "segmented", label: "Order", default: "oldest", options: [{ value: "oldest", label: "Oldest first" }, { value: "newest", label: "Newest first" }] },
        { key: "absences.onlyUnexcused", type: "toggle", label: "Only absences that are not excused", default: false },
        { key: "absences.showText", type: "toggle", label: "Show notes and excuse texts", default: true },
      ],
    },
  ],
});
