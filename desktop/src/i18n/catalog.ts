// Collects every string the UI may pass through i18n.t(), so tests can
// verify that each language translates all of them.

import type { ModuleDef } from "@/core/module";

/** Strings declared as data: module, widget and settings texts. */
export function schemaStrings(modules: readonly ModuleDef[]): string[] {
  const out = new Set<string>();
  const add = (s?: string) => s && out.add(s);
  for (const m of modules) {
    add(m.title);
    for (const c of m.commands ?? []) {
      add(c.title);
      c.keywords?.forEach(add);
    }
    for (const w of m.widgets ?? []) {
      add(w.title);
      add(w.description);
    }
    for (const sec of m.settings ?? []) {
      add(sec.title);
      add(sec.description);
      for (const f of sec.fields) {
        add(f.label);
        add(f.description);
        if ("unit" in f) add(f.unit);
        if ("placeholder" in f) add(f.placeholder);
        if ("options" in f && Array.isArray(f.options)) f.options.forEach((o) => add(o.label));
      }
    }
  }
  return [...out];
}

/** Literal strings in t("…") / i.t("…") / ctx.i18n.t("…") / plural("…", "…") calls. */
export function sourceStrings(sources: string[]): string[] {
  const out = new Set<string>();
  const call = /\b(?:t|plural)\(\s*(?:[^,()]*?,\s*)?"((?:[^"\\]|\\.)+)"(?:\s*,\s*"((?:[^"\\]|\\.)+)")?/g;
  for (const src of sources) {
    for (const m of src.matchAll(call)) {
      out.add(m[1].replace(/\\"/g, '"'));
      if (m[2]) out.add(m[2].replace(/\\"/g, '"'));
    }
    // t(cond ? "A" : "B") and t(cond ? "A" : x ? "B" : "C")
    for (const m of src.matchAll(/\bt\(([^()]*\?[^()]*)\)/g)) for (const s of m[1].matchAll(/"((?:[^"\\]|\\.)+)"/g)) out.add(s[1]);
  }
  return [...out];
}

/** Strings handed to t() through variables (status names, row keys,
 * labels from tables), which the source scan cannot see. */
export const dynamicStrings = [
  // lesson states (ui/lesson.ts) and theme labels
  "Cancelled", "Class removed", "Exam", "Event", "Changed", "Additional", "No teacher",
  // error banner hints (shell)
  "The untis CLI is not set up. Check the data source in the settings, or switch to sample data.",
  "WebUntis rejected the login. Run `untis init` in a terminal to update your credentials.",
  "WebUntis could not be reached. Cached data is shown where available.",
  "The local backend is not reachable.",
  // stats
  "lessons", "cancelled", "changed", "exams", "absences", "school days", "not excused",
  // status page rows
  "Backend", "Connection", "Data source", "CLI version", "Last refresh", "Next refresh", "Last error",
  "Overview window", "School", "Settings file", "Section errors", "live event stream", "disconnected",
  // lesson dialog rows
  "When", "Status", "Subject", "Teacher", "Room", "Classes", "Lesson text", "Info", "Substitution", "Notes",
  // list sections, widget sizes, excuse states, local marks
  "Upcoming", "Past", "Small", "Medium", "Large", "Full width", "open",
  "Mark as read (only in this app)", "Mark as unread (only in this app)",
  "Completed in WebUntis", "Mark as done (only in this app)",
  "{n} school day", "{n} school days", "school days until {date}", "days until {date}",
];

/** Catalog entries that are not language (codes, examples, symbols). */
export const untranslatable = new Set([
  " ms", " px", "×", "…", "s", "A", "B", "C", "MATH", "cli", "week", "--long", "Inter", "Nord", "Deutsch", "English",
  '"IBM Plex Sans"', ".lesson { font-weight: 600; }", "12/31/2026", "2026-12-31", "31.12.2026",
  "~/.config/untis/.env", "~/.config/untis/config.json", "untis CLI",
]);
