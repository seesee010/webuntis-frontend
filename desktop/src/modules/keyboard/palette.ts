import type { AppContext } from "@/core/app";
import { allCommands, bindingKey, fuzzyScore, type CommandDef } from "@/core/commands";
import { h, replace } from "@/core/dom";
import { icon } from "@/core/icons";
import { keyCaps } from "@/modules/settings/controls";

/** Commands available right now, best match first. */
export function rankCommands(ctx: AppContext, query: string): CommandDef[] {
  return allCommands(ctx)
    .filter((c) => c.when?.(ctx) ?? true)
    .map((c) => {
      const title = ctx.i18n.t(c.title);
      const score = Math.max(fuzzyScore(query, title), ...(c.keywords ?? []).map((k) => fuzzyScore(query, ctx.i18n.t(k)) - 1));
      return { c, score };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.c);
}

let open: HTMLDialogElement | null = null;

export function paletteOpen(): boolean {
  return open !== null;
}

/** Opens the command palette (closing it if it is already open). */
export function openPalette(ctx: AppContext): void {
  if (open) return open.close();
  const input = h("input", { type: "text", class: "palette-input", placeholder: ctx.i18n.t("Type a command…"), attrs: { "aria-label": ctx.i18n.t("Command") } });
  const list = h("div", { class: "palette-list", attrs: { role: "listbox" } });
  const dlg = h("dialog", { class: "dialog palette" }, h("div", { class: "dialog-body" }, input, list));
  let items: CommandDef[] = [];
  let active = 0;

  const run = (c: CommandDef) => {
    dlg.close();
    void c.run(ctx);
  };
  const render = () => {
    items = rankCommands(ctx, input.value);
    active = Math.min(active, Math.max(0, items.length - 1));
    replace(
      list,
      items.length
        ? items.map((c, i) =>
            h(
              "button",
              { type: "button", class: ["palette-item", i === active && "active"], dataset: { id: c.id }, attrs: { role: "option" }, onclick: () => run(c) },
              c.icon ? icon(c.icon, 16) : h("span", { style: { width: "16px" } }),
              ctx.i18n.t(c.title),
              h("span", { class: "spacer" }),
              keyCaps(ctx.settings.get<string>(bindingKey(c.id), "")),
            ),
          )
        : h("div", { class: "empty" }, ctx.i18n.t("No matching command.")),
    );
    list.querySelector(".active")?.scrollIntoView?.({ block: "nearest" });
  };

  input.addEventListener("input", () => {
    active = 0;
    render();
  });
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      active = (active + (ev.key === "ArrowDown" ? 1 : -1) + items.length) % Math.max(1, items.length);
      render();
    } else if (ev.key === "Enter" && items[active]) {
      ev.preventDefault();
      run(items[active]);
    }
  });
  dlg.addEventListener("click", (ev) => ev.target === dlg && dlg.close());
  dlg.addEventListener("close", () => {
    dlg.remove();
    open = null;
  });

  document.body.appendChild(dlg);
  open = dlg;
  dlg.showModal();
  render();
  input.focus();
}
