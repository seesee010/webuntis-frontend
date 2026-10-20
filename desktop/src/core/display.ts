import type { Element, Lesson } from "./api/types";
import type { SettingsStore } from "./settings";

/**
 * How codes are shown to the user. Kept in one place so every view
 * honours the same naming settings (short codes, full names, or both)
 * and the per-subject customisation.
 */
export type NameMode = "short" | "long" | "both";

export function elementName(el: Element, mode: NameMode): string {
  if (mode === "short" || !el.long) return el.short;
  if (mode === "long") return el.long;
  return `${el.long} (${el.short})`;
}

export function names(els: Element[], mode: NameMode, sep = ", "): string {
  return els.filter((e) => e.status !== "REMOVED").map((e) => elementName(e, mode)).join(sep);
}

export class Display {
  constructor(private readonly settings: SettingsStore) {}

  private mode(kind: "subjects" | "teachers" | "rooms"): NameMode {
    return this.settings.get<NameMode>(`ui.names.${kind}`, "short");
  }

  subject(l: Pick<Lesson, "subjects" | "info">): string {
    if (!l.subjects.length) return l.info || "Event";
    return names(l.subjects, this.mode("subjects"), " / ");
  }

  teachers(els: Element[]): string {
    return names(els, this.mode("teachers"));
  }

  rooms(els: Element[]): string {
    return names(els, this.mode("rooms"));
  }

  /** Lessons the user wants to see (subject filters hook in here). */
  visibleLessons(lessons: Lesson[]): Lesson[] {
    return lessons;
  }

  /** Per-subject look; empty unless the user customised the subject. */
  subjectStyle(_l: Pick<Lesson, "subjects">): SubjectStyle {
    return {};
  }
}

export interface SubjectStyle {
  color?: string;
  emoji?: string;
}
