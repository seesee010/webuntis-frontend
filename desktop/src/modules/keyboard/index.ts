import type { AppContext } from "@/core/app";
import { allCommands, bindingKey, type CommandDef } from "@/core/commands";
import { h, replace } from "@/core/dom";
import { icon } from "@/core/icons";
import { Keymap, normalizeBinding, strokeOf } from "@/core/keys";
import { defineModule } from "@/core/module";
import type { Scope } from "@/core/reactive";
import { keyCaps, keybindingControl } from "@/modules/settings/controls";
import { openDialog } from "@/ui/dialog";
import { openPalette, paletteOpen } from "./palette";

/** Where typing must not trigger single-key shortcuts. */
function typingIn(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/** Current bindings, from the settings over the commands' defaults. */
export function bindings(ctx: AppContext): Map<string, CommandDef> {
  const map = new Map<string, CommandDef>();
  for (const c of allCommands(ctx)) {
    const b = normalizeBinding(ctx.settings.get<string>(bindingKey(c.id), c.key ?? ""));
    if (b && !map.has(b)) map.set(b, c);
  }
  return map;
}

/** Bindings used by more than one command. */
export function conflicts(ctx: AppContext): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  for (const c of allCommands(ctx)) {
    const b = normalizeBinding(ctx.settings.get<string>(bindingKey(c.id), c.key ?? ""));
    if (b) seen.set(b, [...(seen.get(b) ?? []), c.id]);
  }
  return new Map([...seen].filter(([, ids]) => ids.length > 1));
}

function shortcutTable(ctx: AppContext, scope: Scope): HTMLElement {
  const box = h("div", { class: "shortcut-table" });
  const rows = allCommands(ctx).map((c) => {
    const warn = h("span", { class: "conflict" });
    const row = h(
      "div",
      { class: "shortcut-row", dataset: { id: c.id } },
      c.icon ? icon(c.icon, 16) : h("span"),
      h("span", null, ctx.i18n.t(c.title)),
      warn,
      keybindingControl(bindingKey(c.id), ctx, scope),
    );
    return { row, warn, c };
  });
  scope.watch(ctx.settings.document, () => {
    const dup = conflicts(ctx);
    for (const { warn, c } of rows) {
      const b = normalizeBinding(ctx.settings.get<string>(bindingKey(c.id), c.key ?? ""));
      warn.textContent = dup.has(b) ? ctx.i18n.t("Also used elsewhere") : "";
    }
  });
  replace(box, rows.map((r) => r.row));
  return box;
}

function showShortcuts(ctx: AppContext): void {
  const list = allCommands(ctx)
    .map((c) => ({ c, b: ctx.settings.get<string>(bindingKey(c.id), c.key ?? "") }))
    .filter((x) => x.b);
  void openDialog(
    ctx.i18n.t("Keyboard shortcuts"),
    h("div", null, list.map(({ c, b }) => h("div", { class: "kv" }, h("span", null, ctx.i18n.t(c.title)), keyCaps(b)))),
  );
}

export default defineModule({
  id: "keyboard",
  title: "Keyboard shortcuts",
  icon: "keyboard",
  commands: [
    { id: "palette.open", title: "Open the command palette", icon: "command", key: "mod+k", run: openPalette },
    { id: "shortcuts.show", title: "Show keyboard shortcuts", icon: "keyboard", key: "?", run: showShortcuts },
    {
      id: "data.refresh", title: "Refresh data", icon: "refresh", key: "r", keywords: ["reload", "update"],
      run: async (ctx) => {
        await ctx.data.refresh().catch((err: Error) => ctx.toasts.show("error", ctx.i18n.t("Refresh failed"), err.message));
      },
    },
    { id: "ui.sidebar", title: "Toggle the sidebar", icon: "menu", key: "mod+b", run: (ctx) => ctx.settings.set("ui.sidebarCollapsed", !ctx.settings.get("ui.sidebarCollapsed")) },
    {
      id: "ui.theme", title: "Switch between light and dark", icon: "palette", key: "mod+shift+l", keywords: ["theme", "dark mode"],
      run: (ctx) => ctx.settings.set("ui.theme.mode", document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"),
    },
  ],
  settings: [
    {
      id: "keyboard",
      title: "Keyboard shortcuts",
      icon: "keyboard",
      order: 80,
      description: "Click a shortcut and press the new keys. Two keys in a row (like G then T) make a sequence; Backspace removes a shortcut.",
      fields: [
        { key: "keys.enabled", type: "toggle", label: "Keyboard shortcuts", default: true },
        { key: "keys.sequenceTimeout", type: "number", label: "Time between keys of a sequence", default: 1000, min: 300, max: 3000, unit: "ms" },
        { key: "keys.table", type: "custom", label: "Shortcuts", default: null, render: shortcutTable },
      ],
    },
  ],
  setup(ctx) {
    // Every command's binding is a setting with the command's default.
    for (const c of allCommands(ctx)) ctx.settings.registerDefault(bindingKey(c.id), c.key ?? "");

    let km = new Keymap(new Map<string, CommandDef>());
    const off = ctx.settings.document.subscribe(() => {
      km = new Keymap(bindings(ctx), ctx.settings.get<number>("keys.sequenceTimeout"));
    });

    const onKey = (ev: KeyboardEvent) => {
      if (!ctx.settings.get<boolean>("keys.enabled") || ev.defaultPrevented) return;
      const stroke = strokeOf(ev);
      // In text fields only shortcuts with a modifier count.
      if (typingIn(ev.target) && !stroke.startsWith("mod+")) return;
      if (paletteOpen() && stroke !== "mod+k") return;
      const res = km.feed(stroke);
      if (res.kind === "pending") ev.preventDefault();
      if (res.kind === "match" && (res.target.when?.(ctx) ?? true)) {
        ev.preventDefault();
        void res.target.run(ctx);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      off();
      window.removeEventListener("keydown", onKey);
    };
  },
});
