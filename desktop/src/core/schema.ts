// Declarative settings schemas.
//
// Every module describes its settings as data; the settings page, the
// search, defaults, reset buttons and import/export are all generated
// from these descriptions. A module never builds settings UI by hand
// (except through the "custom" escape hatch).

import type { AppContext } from "./app";
import type { IconName } from "./icons";
import type { Scope } from "./reactive";
import type { SettingsStore } from "./settings";

export interface Option<T extends string = string> {
  value: T;
  label: string;
}

interface Base<T> {
  /** Dot path in the settings document, e.g. "ui.theme.mode". */
  key: string;
  label: string;
  description?: string;
  /** Extra words the search should match. */
  keywords?: string[];
  default: T;
  /** Hides the field unless this returns true. */
  visibleIf?: (settings: SettingsStore) => boolean;
}

export type Field =
  | (Base<boolean> & { type: "toggle" })
  | (Base<number> & { type: "number"; min?: number; max?: number; step?: number; unit?: string })
  | (Base<number> & { type: "range"; min: number; max: number; step?: number; unit?: string })
  | (Base<string> & { type: "select"; options: Option[] | ((ctx: AppContext) => Option[]) })
  | (Base<string> & { type: "segmented"; options: Option[] })
  | (Base<string> & { type: "color" })
  | (Base<string> & { type: "text"; placeholder?: string; multiline?: boolean; monospace?: boolean })
  | (Base<string[]> & { type: "list"; placeholder?: string })
  | (Base<string> & { type: "keybinding" })
  | (Base<unknown> & {
      type: "custom";
      /** Renders the control; it reads and writes the setting itself. */
      render: (ctx: AppContext, scope: Scope) => HTMLElement;
      /** Custom fields usually span the full row. */
      wide?: boolean;
    });

export type FieldType = Field["type"];

export interface SettingsSection {
  id: string;
  title: string;
  icon?: IconName;
  description?: string;
  /** Sort order on the settings page; lower comes first. */
  order?: number;
  fields: Field[];
}

declare module "./module" {
  interface ModuleDef {
    /** Settings this module contributes to the settings page. */
    settings?: SettingsSection[];
  }
}

/** All sections of all modules, sorted. */
export function collectSections(ctx: AppContext): SettingsSection[] {
  return ctx.modules
    .all()
    .flatMap((m) => m.settings ?? [])
    .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}

/** Registers every schema default in the store, so get() falls back to
 * them. Duplicate keys are a programming error. */
export function registerDefaults(ctx: AppContext): void {
  const seen = new Set<string>();
  for (const s of collectSections(ctx)) {
    for (const f of s.fields) {
      if (seen.has(f.key)) throw new Error(`setting "${f.key}" declared twice`);
      seen.add(f.key);
      ctx.settings.registerDefault(f.key, f.default);
    }
  }
}

/** Case-insensitive match of a search query against a field. */
export function matches(field: Field, section: SettingsSection, query: string, translate: (s: string) => string = (s) => s): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const texts = [field.label, field.description, section.title].filter((x): x is string => !!x);
  // Match the English text and its translation, so both languages work.
  const hay = [...texts, ...texts.map(translate), field.key, ...(field.keywords ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((word) => hay.includes(word));
}
