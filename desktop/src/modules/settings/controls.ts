import type { AppContext } from "@/core/app";
import { h, replace } from "@/core/dom";
import { icon } from "@/core/icons";
import type { Scope } from "@/core/reactive";
import type { Field } from "@/core/schema";

/** Renders the input for one schema field, bound to the settings store. */
export function renderControl(field: Field, ctx: AppContext, scope: Scope): HTMLElement {
  const s = ctx.settings;
  const id = `set-${field.key.replace(/\W/g, "-")}`;

  switch (field.type) {
    case "toggle": {
      const input = h("input", { type: "checkbox", id, class: "switch" });
      scope.add(s.watch<boolean>(field.key, (v) => (input.checked = v)));
      input.addEventListener("change", () => s.set(field.key, input.checked));
      return input;
    }
    case "number": {
      const input = h("input", {
        type: "number", id, class: "input num",
        attrs: { min: str(field.min), max: str(field.max), step: str(field.step ?? 1) },
      });
      scope.add(s.watch<number>(field.key, (v) => (input.value = String(v))));
      input.addEventListener("change", () => {
        const n = clamp(Number(input.value), field.min, field.max);
        if (!Number.isNaN(n)) s.set(field.key, n);
      });
      return h("div", { class: "row-inline" }, input, field.unit ? h("span", { class: "muted small" }, ctx.i18n.t(field.unit)) : null);
    }
    case "range": {
      const input = h("input", {
        type: "range", id, class: "range",
        attrs: { min: String(field.min), max: String(field.max), step: str(field.step ?? 1) },
      });
      const out = h("output", { class: "range-value" });
      scope.add(
        s.watch<number>(field.key, (v) => {
          input.value = String(v);
          out.textContent = `${v}${field.unit ? ctx.i18n.t(field.unit) : ""}`;
        }),
      );
      input.addEventListener("input", () => {
        out.textContent = `${input.value}${field.unit ? ctx.i18n.t(field.unit) : ""}`;
        s.set(field.key, Number(input.value));
      });
      return h("div", { class: "row-inline" }, input, out);
    }
    case "select": {
      const select = h("select", { id, class: "input" });
      const opts = typeof field.options === "function" ? field.options(ctx) : field.options;
      replace(select, opts.map((o) => h("option", { value: o.value }, ctx.i18n.t(o.label))));
      scope.add(s.watch<string>(field.key, (v) => (select.value = v)));
      select.addEventListener("change", () => s.set(field.key, select.value));
      return select;
    }
    case "segmented": {
      const group = h("div", { class: "segmented", attrs: { role: "radiogroup" } });
      const buttons = field.options.map((o) =>
        h("button", { type: "button", dataset: { value: o.value }, attrs: { role: "radio" }, onclick: () => s.set(field.key, o.value) }, ctx.i18n.t(o.label)),
      );
      replace(group, buttons);
      scope.add(
        s.watch<string>(field.key, (v) => {
          for (const b of buttons) {
            b.classList.toggle("active", b.dataset.value === v);
            b.setAttribute("aria-checked", String(b.dataset.value === v));
          }
        }),
      );
      return group;
    }
    case "color": {
      const input = h("input", { type: "color", id, class: "color" });
      const text = h("input", { type: "text", class: "input mono hex", attrs: { maxlength: "9", spellcheck: "false" } });
      scope.add(
        s.watch<string>(field.key, (v) => {
          input.value = toHex6(v);
          text.value = v;
        }),
      );
      input.addEventListener("input", () => s.set(field.key, input.value));
      text.addEventListener("change", () => {
        if (/^#[0-9a-f]{3,8}$/i.test(text.value.trim())) s.set(field.key, text.value.trim());
      });
      return h("div", { class: "row-inline" }, input, text);
    }
    case "text": {
      const input = field.multiline
        ? h("textarea", { id, class: ["input", field.monospace && "mono"], attrs: { rows: "6", spellcheck: "false" } })
        : h("input", { type: "text", id, class: ["input", field.monospace && "mono"] });
      if (field.placeholder) input.placeholder = ctx.i18n.t(field.placeholder);
      scope.add(s.watch<string>(field.key, (v) => (input.value = v)));
      input.addEventListener("change", () => s.set(field.key, input.value));
      return input;
    }
    case "list":
      return listControl(field, ctx, scope);
    case "custom":
      return field.render(ctx, scope);
  }
}

/** Editable list of strings, shown as removable chips. */
function listControl(field: Extract<Field, { type: "list" }>, ctx: AppContext, scope: Scope): HTMLElement {
  const s = ctx.settings;
  const chips = h("div", { class: "chips" });
  const input = h("input", { type: "text", class: "input", placeholder: ctx.i18n.t(field.placeholder ?? "Add…") });
  const render = (items: string[]) =>
    replace(
      chips,
      items.map((item, i) =>
        h(
          "span",
          { class: "chip editable" },
          item,
          h("button", {
            type: "button", class: "chip-x", title: ctx.i18n.t("Remove"), attrs: { "aria-label": ctx.i18n.t("Remove") },
            onclick: () => s.set(field.key, items.filter((_, j) => j !== i)),
          }, icon("close", 12)),
        ),
      ),
    );
  scope.add(s.watch<string[]>(field.key, render));
  input.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter") return;
    const v = input.value.trim();
    if (!v) return;
    s.set(field.key, [...s.get<string[]>(field.key, []), v]);
    input.value = "";
  });
  return h("div", { class: "list-control" }, chips, input);
}

function str(n: number | undefined): string | undefined {
  return n === undefined ? undefined : String(n);
}

function clamp(n: number, min?: number, max?: number): number {
  if (min !== undefined && n < min) return min;
  if (max !== undefined && n > max) return max;
  return n;
}

/** <input type=color> only accepts #rrggbb. */
function toHex6(v: string): string {
  if (/^#[0-9a-f]{6}/i.test(v)) return v.slice(0, 7);
  if (/^#[0-9a-f]{3}$/i.test(v)) return `#${[...v.slice(1)].map((c) => c + c).join("")}`;
  return "#000000";
}
