import type { AppContext } from "@/core/app";
import type { Element, Lesson, LessonStatus } from "@/core/api/types";
import { h, type Child } from "@/core/dom";
import { elementName } from "@/core/display";
import { openDialog } from "./dialog";

export const statusText: Record<LessonStatus, string> = {
  regular: "",
  cancelled: "Cancelled",
  removed: "Class removed",
  exam: "Exam",
  event: "Event",
  substitution: "Changed",
  additional: "Additional",
  "no-teacher": "No teacher",
};

/** One element list for the details: "IVE (for BRO)", removed ones struck. */
function elements(ctx: AppContext, els: Element[]): Child {
  if (!els.length) return h("span", { class: "muted" }, "–");
  return els.map((e, i) => [
    i > 0 ? ", " : null,
    h(
      "span",
      { class: ["el", e.status === "REMOVED" && "removed", e.replaces && "changed"], title: e.long ?? "" },
      elementName(e, "both"),
      e.replaces ? h("span", { class: "muted" }, ` ${ctx.i18n.t("(for {name})", { name: e.replacesLong ?? e.replaces })}`) : null,
    ),
  ]);
}

export function showLessonDetails(ctx: AppContext, l: Lesson): void {
  const i = ctx.i18n;
  const row = (k: string, v: Child) => h("div", { class: "kv" }, h("span", { class: "muted" }, i.t(k)), h("span", null, v));
  void openDialog(
    h("span", { class: "row-inline" }, h("span", { class: "status-dot", style: { background: `var(--c-${l.status})` } }), ctx.display.subject(l)),
    h(
      "div",
      null,
      row("When", `${i.date(l.date, "long")}, ${i.timeRange(l.start, l.end)}`),
      l.status !== "regular" ? row("Status", h("span", { class: "chip", style: { color: `var(--c-${l.status})` } }, i.t(statusText[l.status]))) : null,
      row("Subject", l.subjects.length ? elements(ctx, l.subjects) : l.info ?? "–"),
      row("Teacher", elements(ctx, l.teachers)),
      row("Room", elements(ctx, l.rooms)),
      row("Classes", elements(ctx, l.classes)),
      l.text ? row("Lesson text", l.text) : null,
      l.info && l.subjects.length ? row("Info", l.info) : null,
      l.substitutionText ? row("Substitution", l.substitutionText) : null,
      l.notes ? row("Notes", l.notes) : null,
    ),
  );
}
