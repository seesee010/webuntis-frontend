// Commands: named actions that modules contribute. The command palette
// lists them and keyboard shortcuts trigger them; bindings are settings
// ("keys.<command id>"), so every shortcut can be changed.

import type { AppContext } from "./app";
import type { IconName } from "./icons";

export interface CommandDef {
  id: string;
  /** English text, translated through i18n. */
  title: string;
  icon?: IconName;
  keywords?: string[];
  /** Default binding, e.g. "mod+k" or "g t"; empty for none. */
  key?: string;
  /** Only available when this returns true (e.g. on a certain page). */
  when?(ctx: AppContext): boolean;
  run(ctx: AppContext): void | Promise<void>;
}

declare module "./module" {
  interface ModuleDef {
    commands?: CommandDef[];
  }
  interface RouteDef {
    /** Default shortcut of the generated "Go to …" command. */
    key?: string;
  }
}

/** All commands: the modules' own plus one "Go to …" per page. */
export function allCommands(ctx: AppContext): CommandDef[] {
  const nav: CommandDef[] = ctx.modules
    .all()
    .filter((m) => m.route && m.route.nav !== false)
    .map((m) => ({
      id: `go.${m.id}`,
      title: ctx.i18n.t("Go to {page}", { page: ctx.i18n.t(m.title) }),
      icon: m.icon,
      key: m.route!.key,
      keywords: [m.title],
      run: (c) => c.router.navigate(m.route!.path),
    }));
  return [...nav, ...ctx.modules.all().flatMap((m) => m.commands ?? [])];
}

export function bindingKey(id: string): string {
  return `keys.${id.replace(/\./g, "_")}`;
}

/** Fuzzy score of a query against a text: all characters in order;
 * consecutive and word-start hits score higher. -1 means no match. */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase().replace(/\s+/g, "");
  const t = text.toLowerCase();
  if (!q) return 0;
  let score = 0;
  let ti = 0;
  let streak = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found === -1) return -1;
    streak = found === ti ? streak + 1 : 0;
    score += 1 + streak * 2 + (found === 0 || t[found - 1] === " " ? 3 : 0);
    ti = found + 1;
  }
  return score - t.length * 0.01;
}
