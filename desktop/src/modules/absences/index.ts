import type { AppContext } from "@/core/app";
import type { Absence, Period } from "@/core/api/types";
import { h, replace } from "@/core/dom";
import { defineModule } from "@/core/module";
import type { Scope } from "@/core/reactive";
import { live } from "@/modules/dashboard/widgets";
import { shortDate } from "@/ui/relative";
import { missedLessons, totals, type AbsenceTotals } from "./logic";

function opt<T>(ctx: AppContext, key: string): T {
  return ctx.settings.get<T>(`absences.${key}`);
}

function select(ctx: AppContext, list: Absence[]): Absence[] {
  const out = opt<boolean>(ctx, "onlyUnexcused") ? list.filter((a) => !a.excused) : [...list];
  const dir = opt<string>(ctx, "sort") === "newest" ? -1 : 1;
  return out.sort((a, b) => dir * (a.startDate + (a.startTime ?? "")).localeCompare(b.startDate + (b.startTime ?? "")));
}

function totalsView(t: AbsenceTotals): HTMLElement {
  const stat = (n: number, label: string, cls = "") => h("div", { class: "stat" }, h("div", { class: ["stat-n", cls] }, String(n)), h("div", { class: "muted small" }, label));
  return h("div", { class: "stats four" }, stat(t.count, "absences"), stat(t.days, "school days"), stat(t.lessons, "lessons"), stat(t.unexcused, "not excused", t.unexcused ? "bad" : ""));
}

function absenceRow(ctx: AppContext, a: Absence, grid: Period[]): HTMLElement {
  const span = a.startDate === a.endDate ? shortDate(a.startDate) : `${shortDate(a.startDate)} – ${shortDate(a.endDate)}`;
  const lessons = missedLessons(a, grid);
  return h(
    "div",
    { class: ["list-row", !a.excused && "unexcused"], dataset: { id: a.id } },
    h("div", { class: "list-date" }, h("strong", null, span), a.startTime ? h("span", { class: "muted small" }, `${a.startTime}–${a.endTime ?? ""}`) : null),
    h(
      "div",
      { class: "list-main" },
      h("div", null, h("strong", null, a.reason || "Absence"), grid.length ? h("span", { class: "muted small" }, ` · ${lessons} lesson${lessons === 1 ? "" : "s"}`) : null),
      opt<boolean>(ctx, "showText") && a.text ? h("div", { class: "muted small" }, a.text) : null,
      opt<boolean>(ctx, "showText") && a.excuseText ? h("div", { class: "muted small" }, `Excuse: ${a.excuseText}`) : null,
    ),
    h("span", { class: ["chip", a.excused ? "chip-ok" : "chip-bad"] }, a.excused ? "excused" : a.excuseStatus || "not excused"),
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
      h("section", { class: "card" }, h("h2", { class: "card-title" }, "Totals"), totalsView(totals(snap.absences, snap.timeGrid))),
      h(
        "section",
        { class: "card" },
        h("h2", { class: "card-title" }, "Absences"),
        list.length ? list.map((a) => absenceRow(ctx, a, snap.timeGrid)) : h("div", { class: "empty" }, "No absences in the loaded period."),
      ),
      snap.errors.absences ? h("div", { class: "muted small" }, `Absences could not be loaded: ${snap.errors.absences}`) : null,
      h("div", { class: "muted small" }, `Covers ${snap.meta.from} – ${snap.meta.to}; change the history under Settings › Data source.`),
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
  route: { path: "/absences", render: renderAbsences },
  widgets: [
    {
      id: "absence-totals",
      title: "Absences",
      icon: "absence",
      size: "small",
      enabledByDefault: false,
      render: (ctx, scope) => live(ctx, scope, (snap) => totalsView(totals(snap.absences, snap.timeGrid))),
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
