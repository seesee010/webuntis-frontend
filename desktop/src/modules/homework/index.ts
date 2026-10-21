import type { AppContext } from "@/core/app";
import type { Homework } from "@/core/api/types";
import { daysBetween, today } from "@/core/dates";
import { h, replace } from "@/core/dom";
import { icon } from "@/core/icons";
import { IdSet } from "@/core/local-state";
import { defineModule } from "@/core/module";
import type { Scope } from "@/core/reactive";
import { live } from "@/modules/dashboard/widgets";
import { sortHomework, stateOf, type HomeworkSort } from "./logic";

function opt<T>(ctx: AppContext, key: string): T {
  return ctx.settings.get<T>(`homework.${key}`);
}

const doneSet = (ctx: AppContext) => new IdSet(ctx.settings, "state.homework.done");

function prepare(ctx: AppContext, items: Homework[]) {
  const t = today();
  const done = doneSet(ctx);
  const state = (hw: Homework) => stateOf(hw, t, done.has(hw.id));
  const subject = (hw: Homework) => ctx.display.subject({ subjects: hw.subjects });
  let list = sortHomework(ctx.display.visibleHomework(items), opt<HomeworkSort>(ctx, "sort"), state, subject);
  if (!opt<boolean>(ctx, "showCompleted")) list = list.filter((hw) => state(hw) !== "done");
  return { list, state, t, done };
}

function homeworkRow(ctx: AppContext, hw: Homework, st: ReturnType<typeof stateOf>, t: string, done: IdSet): HTMLElement {
  const i = ctx.i18n;
  const box = h("input", {
    type: "checkbox", class: "check", checked: st === "done", disabled: hw.completed,
    title: i.t(hw.completed ? "Completed in WebUntis" : "Mark as done (only in this app)"),
    attrs: { "aria-label": i.t("Done") },
  });
  box.addEventListener("change", () => done.set(hw.id, box.checked));
  const due = daysBetween(t, hw.dueDate);
  return h(
    "div",
    { class: ["list-row", "hw", `hw-${st}`], dataset: { id: hw.id } },
    box,
    h(
      "div",
      { class: "list-main" },
      h("div", null, h("strong", null, ctx.display.subject({ subjects: hw.subjects })), h("span", { class: "muted small" }, ` · ${ctx.display.teachers(hw.teachers)}`)),
      h("div", { class: ["hw-text", opt<boolean>(ctx, "clampText") && "clamp"] }, hw.text),
      hw.remark ? h("div", { class: "muted small" }, hw.remark) : null,
      opt<boolean>(ctx, "showAttachments") && hw.attachments.length
        ? h("div", { class: "attachments" }, hw.attachments.map((a) => h("span", { class: "chip" }, icon("paperclip", 12), a.name)))
        : null,
    ),
    h(
      "div",
      { class: "list-date right" },
      h("strong", null, i.date(hw.dueDate, "weekdayDay")),
      h("span", { class: ["small", st === "overdue" ? "bad" : "muted"] }, st === "done" ? i.t("done") : due < 0 ? i.t("overdue by {n} d", { n: -due }) : i.relativeDay(hw.dueDate, t)),
    ),
  );
}

function renderHomework(ctx: AppContext, scope: Scope): HTMLElement {
  const body = h("div", { class: "list-page" });
  const render = () => {
    const snap = ctx.data.overview.get();
    if (!snap) return replace(body, h("div", { class: "skeleton" }));
    const { list, state, t, done } = prepare(ctx, snap.homework);
    done.prune(snap.homework.map((hw) => hw.id));
    const open = list.filter((hw) => state(hw) !== "done").length;
    replace(
      body,
      h(
        "section",
        { class: "card" },
        h("h2", { class: "card-title" }, ctx.i18n.t("Homework"), h("span", { class: "chip" }, ctx.i18n.t("{n} open", { n: open }))),
        list.length ? list.map((hw) => homeworkRow(ctx, hw, state(hw), t, done)) : h("div", { class: "empty" }, ctx.i18n.t("No homework. 🎉")),
      ),
      h("div", { class: "muted small" }, ctx.i18n.t("Ticking homework off only marks it here; WebUntis is not changed.")),
    );
  };
  scope.watch(ctx.data.overview, render);
  scope.watch(ctx.settings.document, render, false);
  return h("div", { class: "page narrow" }, body);
}

export default defineModule({
  id: "homework",
  title: "Homework",
  icon: "book",
  order: 40,
  route: { path: "/homework", render: renderHomework },
  widgets: [
    {
      id: "open-homework",
      title: "Open homework",
      icon: "book",
      size: "small",
      render: (ctx, scope) =>
        live(ctx, scope, (snap) => {
          const { list, state, t, done } = prepare(ctx, snap.homework);
          const open = list.filter((hw) => state(hw) !== "done").slice(0, opt<number>(ctx, "widgetCount"));
          return open.length ? open.map((hw) => homeworkRow(ctx, hw, state(hw), t, done)) : h("div", { class: "muted" }, ctx.i18n.t("Nothing open."));
        }),
    },
  ],
  settings: [
    {
      id: "homework",
      title: "Homework",
      icon: "book",
      order: 40,
      fields: [
        { key: "homework.sort", type: "segmented", label: "Sort by", default: "due", options: [{ value: "due", label: "Due date" }, { value: "given", label: "Given" }, { value: "subject", label: "Subject" }] },
        { key: "homework.showCompleted", type: "toggle", label: "Show completed homework", default: true },
        { key: "homework.showAttachments", type: "toggle", label: "Show attachments", default: true },
        { key: "homework.clampText", type: "toggle", label: "Shorten long texts", description: "Limit each text to three lines.", default: false },
        { key: "homework.widgetCount", type: "number", label: "Items in the dashboard widget", default: 4, min: 1, max: 20 },
      ],
    },
  ],
});
