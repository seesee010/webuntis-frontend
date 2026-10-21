import type { AppContext } from "@/core/app";
import { h, replace } from "@/core/dom";
import { icon } from "@/core/icons";
import type { Scope } from "@/core/reactive";
import { allWidgets, resolveLayout, type WidgetSize, type WidgetSlot } from "@/core/widgets";

const sizes: { value: WidgetSize; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "full", label: "Full width" },
];

/** Reorder, show/hide and resize dashboard widgets. Used inside the
 * settings page and the dashboard's "Customise" dialog. */
export function layoutEditor(ctx: AppContext, scope: Scope): HTMLElement {
  const list = h("div", { class: "layout-editor" });
  const available = allWidgets(ctx);
  const save = (slots: WidgetSlot[]) => ctx.settings.set("dashboard.layout", slots);

  scope.add(
    ctx.settings.watch<WidgetSlot[] | null>("dashboard.layout", (stored) => {
      const slots = resolveLayout(available, stored ?? undefined);
      const move = (i: number, d: number) => {
        const next = [...slots];
        [next[i], next[i + d]] = [next[i + d], next[i]];
        save(next);
      };
      replace(
        list,
        slots.map((s, i) => {
          const w = available.find((x) => x.id === s.id)!;
          const toggle = h("input", { type: "checkbox", class: "switch", checked: s.enabled, attrs: { "aria-label": ctx.i18n.t(w.title) } });
          toggle.addEventListener("change", () => save(slots.map((x, j) => (j === i ? { ...x, enabled: toggle.checked } : x))));
          const size = h("select", { class: "input" }, sizes.map((o) => h("option", { value: o.value, selected: o.value === s.size }, ctx.i18n.t(o.label))));
          size.addEventListener("change", () => save(slots.map((x, j) => (j === i ? { ...x, size: size.value as WidgetSize } : x))));
          return h(
            "div",
            { class: ["layout-row", !s.enabled && "off"] },
            toggle,
            icon(w.icon, 16),
            h("div", { class: "layout-title" }, h("div", null, ctx.i18n.t(w.title)), w.description ? h("div", { class: "muted small" }, ctx.i18n.t(w.description)) : null),
            size,
            h("button", { type: "button", class: "icon-btn", title: ctx.i18n.t("Move up"), disabled: i === 0, onclick: () => move(i, -1) }, icon("left", 14)),
            h("button", { type: "button", class: "icon-btn", title: ctx.i18n.t("Move down"), disabled: i === slots.length - 1, onclick: () => move(i, 1) }, icon("right", 14)),
          );
        }),
      );
    }, null),
  );
  return list;
}
