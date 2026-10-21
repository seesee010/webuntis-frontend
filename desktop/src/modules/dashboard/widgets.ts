import type { AppContext } from "@/core/app";
import type { Lesson, Snapshot } from "@/core/api/types";
import { addDays, minutes, nowMinutes, startOfWeek, today } from "@/core/dates";
import { h, replace } from "@/core/dom";
import type { Scope } from "@/core/reactive";
import type { WidgetDef } from "@/core/widgets";
import { showLessonDetails, statusText } from "@/ui/lesson";
import { nowNext, takesPlace } from "./now";

/** Re-renders a widget whenever the overview or the settings change. */
export function live(ctx: AppContext, scope: Scope, draw: (snap: Snapshot) => HTMLElement | HTMLElement[] | null, everyMs = 0): HTMLElement {
  const box = h("div", { class: "widget-content" });
  const render = () => {
    const snap = ctx.data.overview.get();
    if (!snap) return replace(box, h("div", { class: "skeleton" }));
    replace(box, draw(snap) ?? h("div", { class: "muted small" }, ctx.i18n.t("Nothing to show.")));
  };
  scope.watch(ctx.data.overview, render);
  scope.watch(ctx.settings.document, render, false);
  if (everyMs) scope.interval(render, everyMs);
  return box;
}

function dayLabel(ctx: AppContext, date: string): string {
  const t = today();
  if (date === t) return ctx.i18n.t("Today");
  if (date === addDays(t, 1)) return ctx.i18n.t("Tomorrow");
  return `${ctx.i18n.weekday(date, "long")}, ${ctx.i18n.date(date, "dayMonth")}`;
}

function lessonLine(ctx: AppContext, l: Lesson, opts: { date?: boolean } = {}): HTMLElement {
  return h(
    "button",
    { type: "button", class: ["agenda-row", `st-${l.status}`, (l.cancelled || l.removed) && "struck"], onclick: () => showLessonDetails(ctx, l) },
    h("span", { class: "agenda-time" }, opts.date ? `${ctx.i18n.weekday(l.date)} ${ctx.i18n.shortNumeric(l.date)} ` : "", ctx.i18n.time(l.start)),
    h("span", { class: "status-dot", style: { background: ctx.display.subjectStyle(l).color ?? `var(--c-${l.status})` } }),
    h("span", { class: "agenda-subject" }, ctx.display.subject(l)),
    h("span", { class: "agenda-meta muted" }, ctx.display.rooms(l.rooms)),
    l.status !== "regular" ? h("span", { class: "chip", style: { color: `var(--c-${l.status})` } }, ctx.i18n.t(statusText[l.status])) : null,
  );
}

const nowWidget: WidgetDef = {
  id: "now",
  title: "Now & next",
  icon: "clock",
  size: "medium",
  render: (ctx, scope) =>
    live(
      ctx,
      scope,
      (snap) => {
        const t = nowMinutes();
        const i = ctx.i18n;
        const lessons = ctx.display.visibleLessons(snap.lessons);
        const { current, next, today: todays } = nowNext(lessons, today(), t);
        const parts: HTMLElement[] = [];
        if (current.length) {
          const c = current[0];
          const s = minutes(c.start);
          const e = Math.max(...current.map((l) => minutes(l.end)));
          parts.push(
            h(
              "div",
              { class: "now-block" },
              h("div", { class: "muted small" }, i.t("Now")),
              h("div", { class: "now-subject" }, current.map((l) => ctx.display.subject(l)).join(" / ")),
              h("div", { class: "muted" }, `${i.timeRange(c.start, current[0].end)} · ${ctx.display.rooms(current.flatMap((l) => l.rooms))}`),
              h("div", { class: "progress" }, h("div", { class: "progress-bar", style: { width: `${((t - s) / (e - s)) * 100}%` } })),
              h("div", { class: "small" }, i.t("{time} left", { time: i.duration(e - t) })),
            ),
          );
        }
        if (next.length) {
          const n = next[0];
          const when = n.date === today() ? i.t("in {time}", { time: i.duration(minutes(n.start) - t) }) : `${dayLabel(ctx, n.date)}, ${i.time(n.start)}`;
          parts.push(
            h(
              "div",
              { class: "now-block next" },
              h("div", { class: "muted small" }, i.t(current.length ? "Next" : "Next lesson")),
              h("div", { class: "now-subject small-subject" }, next.map((l) => ctx.display.subject(l)).join(" / ")),
              h("div", { class: "muted" }, `${when} · ${ctx.display.rooms(next.flatMap((l) => l.rooms))}`),
            ),
          );
        }
        if (todays.length && ctx.settings.get<boolean>("dashboard.dayProgress")) {
          const done = todays.filter((l) => minutes(l.end) <= t).length;
          parts.push(h("div", { class: "muted small" }, i.t("{done} of {total} lessons done today · school ends {time}", { done, total: todays.length, time: i.time(todays[todays.length - 1].end) })));
        }
        return parts.length ? parts : h("div", { class: "muted" }, i.t("No more lessons in the loaded period."));
      },
      30_000,
    ),
};

const agendaWidget: WidgetDef = {
  id: "agenda",
  title: "Agenda",
  icon: "list",
  size: "medium",
  render: (ctx, scope) =>
    live(
      ctx,
      scope,
      (snap) => {
        const lessons = ctx.display.visibleLessons(snap.lessons);
        const t = today();
        const todays = lessons.filter((l) => l.date === t);
        const schoolOver = !todays.filter(takesPlace).some((l) => minutes(l.end) > nowMinutes());
        // After school the agenda moves on to the next school day.
        const day =
          ctx.settings.get<boolean>("dashboard.agendaAdvance") && schoolOver
            ? (lessons.find((l) => l.date > t && takesPlace(l))?.date ?? t)
            : t;
        const rows = lessons.filter((l) => l.date === day);
        return [
          h("div", { class: "muted small agenda-day" }, dayLabel(ctx, day)),
          ...(rows.length ? rows.map((l) => lessonLine(ctx, l)) : [h("div", { class: "muted" }, ctx.i18n.t("No lessons."))]),
        ];
      },
      60_000,
    ),
};

const changesWidget: WidgetDef = {
  id: "changes",
  title: "Upcoming changes",
  icon: "alert",
  size: "medium",
  description: "Cancellations, substitutions, room changes and events in the coming days.",
  render: (ctx, scope) =>
    live(ctx, scope, (snap) => {
      const t = today();
      const horizon = addDays(t, ctx.settings.get<number>("dashboard.changesDays"));
      const rows = ctx.display
        .visibleLessons(snap.lessons)
        .filter((l) => l.status !== "regular" && l.status !== "exam" && l.date >= t && l.date <= horizon);
      return rows.length ? rows.map((l) => lessonLine(ctx, l, { date: true })) : h("div", { class: "muted" }, ctx.i18n.t("No changes ahead."));
    }),
};

const statsWidget: WidgetDef = {
  id: "week-stats",
  title: "This week",
  icon: "activity",
  size: "small",
  render: (ctx, scope) =>
    live(ctx, scope, (snap) => {
      const from = startOfWeek(today(), ctx.i18n.firstDay());
      const to = addDays(from, 6);
      const week = ctx.display.visibleLessons(snap.lessons).filter((l) => l.date >= from && l.date <= to);
      const stat = (n: number, label: string, color?: string) =>
        h("div", { class: "stat" }, h("div", { class: "stat-n", style: color ? { color } : {} }, String(n)), h("div", { class: "muted small" }, ctx.i18n.t(label)));
      return h(
        "div",
        { class: "stats" },
        stat(week.filter(takesPlace).length, "lessons"),
        stat(week.filter((l) => l.cancelled).length, "cancelled", "var(--c-cancelled)"),
        stat(week.filter((l) => l.substitution).length, "changed", "var(--c-substitution)"),
        stat(week.filter((l) => l.exam).length, "exams", "var(--c-exam)"),
      );
    }),
};

export const timetableWidgets: WidgetDef[] = [nowWidget, agendaWidget, changesWidget, statsWidget];
