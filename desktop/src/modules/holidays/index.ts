import type { AppContext } from "@/core/app";
import type { Holiday } from "@/core/api/types";
import { daysBetween, today } from "@/core/dates";
import { h, replace } from "@/core/dom";
import { defineModule } from "@/core/module";
import type { Scope } from "@/core/reactive";
import { live } from "@/modules/dashboard/widgets";
import { shortDate } from "@/ui/relative";
import { mergeBreaks, schoolDaysUntil, upcoming } from "./logic";

function opt<T>(ctx: AppContext, key: string): T {
  return ctx.settings.get<T>(`holidays.${key}`);
}

function prepare(ctx: AppContext, items: Holiday[]): Holiday[] {
  const list = opt<boolean>(ctx, "mergeAdjacent") ? mergeBreaks(items) : [...items].sort((a, b) => a.start.localeCompare(b.start));
  return opt<boolean>(ctx, "showPast") ? list : upcoming(list, today());
}

function holidayRow(ctx: AppContext, hd: Holiday, all: Holiday[]): HTMLElement {
  const t = today();
  const now = hd.start <= t && t <= hd.end;
  const days = daysBetween(t, hd.start);
  const length = daysBetween(hd.start, hd.end) + 1;
  const countdown = now
    ? `now · ${daysBetween(t, hd.end)} days left`
    : hd.end < t
      ? "past"
      : opt<boolean>(ctx, "countSchoolDays")
        ? `in ${days} days · ${schoolDaysUntil(hd, t, all)} school days`
        : `in ${days} days`;
  return h(
    "div",
    { class: ["list-row", now && "current", hd.end < t && "past"], dataset: { id: hd.id } },
    h("div", { class: "list-date" }, h("strong", null, hd.start === hd.end ? shortDate(hd.start) : `${shortDate(hd.start)} – ${shortDate(hd.end)}`), h("span", { class: "muted small" }, `${length} day${length === 1 ? "" : "s"}`)),
    h("div", { class: "list-main" }, h("strong", null, hd.name)),
    h("span", { class: ["chip", now && "chip-warn"] }, countdown),
  );
}

function renderHolidays(ctx: AppContext, scope: Scope): HTMLElement {
  const body = h("div", { class: "list-page" });
  const render = () => {
    const snap = ctx.data.overview.get();
    if (!snap) return replace(body, h("div", { class: "skeleton" }));
    const list = prepare(ctx, snap.holidays);
    replace(body, h("section", { class: "card" }, h("h2", { class: "card-title" }, "Holidays"), list.length ? list.map((hd) => holidayRow(ctx, hd, snap.holidays)) : h("div", { class: "empty" }, "No holidays known.")));
  };
  scope.watch(ctx.data.overview, render);
  scope.watch(ctx.settings.document, render, false);
  return h("div", { class: "page narrow" }, body);
}

export default defineModule({
  id: "holidays",
  title: "Holidays",
  icon: "sun",
  order: 70,
  route: { path: "/holidays", render: renderHolidays },
  widgets: [
    {
      id: "holiday-countdown",
      title: "Next break",
      icon: "sun",
      size: "small",
      render: (ctx, scope) =>
        live(ctx, scope, (snap) => {
          const t = today();
          const next = upcoming(mergeBreaks(snap.holidays), t)[0];
          if (!next) return h("div", { class: "muted" }, "No break ahead.");
          const now = next.start <= t;
          return h(
            "div",
            { class: "countdown" },
            h("div", { class: "stat-n" }, now ? "🎉" : String(opt<boolean>(ctx, "countSchoolDays") ? schoolDaysUntil(next, t, snap.holidays) : daysBetween(t, next.start))),
            h("div", null, h("strong", null, next.name), h("div", { class: "muted small" }, now ? `until ${shortDate(next.end)}` : `${opt<boolean>(ctx, "countSchoolDays") ? "school days" : "days"} until ${shortDate(next.start)}`)),
          );
        }),
    },
  ],
  settings: [
    {
      id: "holidays",
      title: "Holidays",
      icon: "sun",
      order: 70,
      fields: [
        { key: "holidays.mergeAdjacent", type: "toggle", label: "Merge touching holidays", description: "Treat holidays with no school day between them as one break.", default: true },
        { key: "holidays.countSchoolDays", type: "toggle", label: "Count school days", description: "Count down school days instead of calendar days.", default: true },
        { key: "holidays.showPast", type: "toggle", label: "Show past holidays", default: false },
      ],
    },
  ],
});
