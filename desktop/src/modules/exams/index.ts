import type { AppContext } from "@/core/app";
import type { Exam } from "@/core/api/types";
import { daysBetween, today } from "@/core/dates";
import { h, replace } from "@/core/dom";
import { defineModule } from "@/core/module";
import type { Scope } from "@/core/reactive";
import { live } from "@/modules/dashboard/widgets";
import { groupBy, monthLabel, relativeDay, shortDate } from "@/ui/relative";
import { examTitle, sortExams } from "./logic";

function opt<T>(ctx: AppContext, key: string): T {
  return ctx.settings.get<T>(`exams.${key}`);
}

function examRow(ctx: AppContext, e: Exam, t: string): HTMLElement {
  const days = daysBetween(t, e.date);
  const soon = days >= 0 && days <= opt<number>(ctx, "soonDays");
  const subject = { subjects: e.subjects, info: examTitle(e) };
  const color = ctx.display.subjectStyle(subject).color ?? "var(--c-exam)";
  return h(
    "div",
    { class: ["list-row", days < 0 && "past", soon && "soon"], dataset: { id: e.id } },
    h("div", { class: "list-date" }, h("strong", null, shortDate(e.date)), e.start ? h("span", { class: "muted small" }, `${e.start}–${e.end ?? ""}`) : null),
    h("span", { class: "status-dot", style: { background: color } }),
    h(
      "div",
      { class: "list-main" },
      h("div", null, h("strong", null, ctx.display.subject(subject)), " · ", examTitle(e)),
      opt<boolean>(ctx, "showDetails") && (e.text || e.rooms.length || e.teachers.length)
        ? h("div", { class: "muted small" }, [e.text, ctx.display.rooms(e.rooms), ctx.display.teachers(e.teachers)].filter(Boolean).join(" · "))
        : null,
    ),
    e.grade && opt<boolean>(ctx, "showGrades") ? h("span", { class: "grade", title: "Grade" }, e.grade) : null,
    opt<boolean>(ctx, "showCountdown") ? h("span", { class: ["chip", soon && "chip-warn"] }, relativeDay(e.date, t)) : null,
  );
}

function renderExams(ctx: AppContext, scope: Scope): HTMLElement {
  const body = h("div", { class: "list-page" });
  const render = () => {
    const snap = ctx.data.overview.get();
    if (!snap) return replace(body, h("div", { class: "skeleton" }));
    const t = today();
    const exams = ctx.display.visibleExams(snap.exams);
    const { upcoming, past } = sortExams(exams, { today: t, showPast: opt(ctx, "showPast") });
    const group = (list: Exam[]) =>
      opt<string>(ctx, "groupBy") === "month"
        ? groupBy(list, (e) => monthLabel(e.date))
        : opt<string>(ctx, "groupBy") === "subject"
          ? groupBy([...list].sort((a, b) => ctx.display.subject({ subjects: a.subjects }).localeCompare(ctx.display.subject({ subjects: b.subjects }))), (e) => ctx.display.subject({ subjects: e.subjects, info: examTitle(e) }))
          : ([["", list]] as [string, Exam[]][]);
    const section = (title: string, list: Exam[]) =>
      list.length
        ? h(
            "section",
            { class: "card" },
            h("h2", { class: "card-title" }, title, h("span", { class: "chip" }, String(list.length))),
            group(list).map(([g, items]) => [g ? h("div", { class: "list-group" }, g) : null, items.map((e) => examRow(ctx, e, t))]),
          )
        : null;
    replace(
      body,
      upcoming.length || past.length
        ? [section("Upcoming", upcoming), section("Past", past)]
        : h("div", { class: "card empty" }, "No exams in the loaded period."),
      snap.errors.exams ? h("div", { class: "muted small" }, `Exams could not be loaded: ${snap.errors.exams}`) : null,
    );
  };
  scope.watch(ctx.data.overview, render);
  scope.watch(ctx.settings.document, render, false);
  return h("div", { class: "page narrow" }, body);
}

export default defineModule({
  id: "exams",
  title: "Exams",
  icon: "exam",
  order: 30,
  route: { path: "/exams", render: renderExams },
  widgets: [
    {
      id: "upcoming-exams",
      title: "Upcoming exams",
      icon: "exam",
      size: "small",
      render: (ctx, scope) =>
        live(ctx, scope, (snap) => {
          const t = today();
          const list = sortExams(ctx.display.visibleExams(snap.exams), { today: t, showPast: false }).upcoming.slice(0, opt<number>(ctx, "widgetCount"));
          return list.length ? list.map((e) => examRow(ctx, e, t)) : h("div", { class: "muted" }, "No upcoming exams.");
        }),
    },
  ],
  settings: [
    {
      id: "exams",
      title: "Exams",
      icon: "exam",
      order: 30,
      fields: [
        { key: "exams.showPast", type: "toggle", label: "Show past exams", default: true },
        { key: "exams.groupBy", type: "segmented", label: "Group by", default: "none", options: [{ value: "none", label: "None" }, { value: "month", label: "Month" }, { value: "subject", label: "Subject" }] },
        { key: "exams.showCountdown", type: "toggle", label: "Countdown", description: "\"in 3 days\" next to each exam.", default: true },
        { key: "exams.soonDays", type: "number", label: "Highlight exams within", default: 3, min: 0, max: 30, unit: "days" },
        { key: "exams.showGrades", type: "toggle", label: "Show grades", default: true },
        { key: "exams.showDetails", type: "toggle", label: "Show room, teacher and text", default: true },
        { key: "exams.widgetCount", type: "number", label: "Exams in the dashboard widget", default: 4, min: 1, max: 20 },
      ],
    },
  ],
});
