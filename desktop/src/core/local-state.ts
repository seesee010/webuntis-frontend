import { addDays, isISODate, today } from "./dates";
import type { SettingsStore } from "./settings";

/** One mark: the item's id and a date it is kept for (see IdSet.prune). */
interface Mark {
  id: string;
  date: string;
}

/**
 * How long a mark outlives the last time its item was seen. Longer than any
 * overview window looks back (366 days), so an item that is gone that long
 * can never be shown again.
 */
const KEEP_DAYS = 400;

/** A present item's date is refreshed once it is this old, not on every render. */
const REFRESH_DAYS = 30;

/**
 * GUI-only marks (homework done, message read) that WebUntis does not
 * know about. They are stored in the settings document under "state.*",
 * so they survive restarts and travel with exported settings.
 */
export class IdSet {
  constructor(
    private readonly settings: SettingsStore,
    private readonly key: string,
  ) {}

  private stored(): unknown[] {
    const raw = this.settings.get<unknown>(this.key, []);
    return Array.isArray(raw) ? raw : [];
  }

  /** The stored marks. Older versions stored plain ids; those count as seen today. */
  private marks(): Mark[] {
    const t = today();
    return this.stored().flatMap((m): Mark[] => {
      if (typeof m === "string") return [{ id: m, date: t }];
      if (m && typeof m === "object" && typeof (m as Mark).id === "string") {
        const date = (m as Mark).date;
        return [{ id: (m as Mark).id, date: isISODate(date) ? date : t }];
      }
      return [];
    });
  }

  private save(marks: Mark[]): void {
    this.settings.set(this.key, marks);
  }

  has(id: string): boolean {
    return this.marks().some((m) => m.id === id);
  }

  /** date is the item's own date (homework due date, message date), if it has one. */
  set(id: string, on: boolean, date?: string): void {
    const rest = this.marks().filter((m) => m.id !== id);
    const t = today();
    const day = date?.slice(0, 10);
    this.save(on ? [...rest, { id, date: isISODate(day) && day > t ? day : t }] : rest);
  }

  toggle(id: string, date?: string): void {
    this.set(id, !this.has(id), date);
  }

  /**
   * Forgets the marks of items that are gone for good, so the list cannot
   * grow forever. An item can be missing from one snapshot for many normal
   * reasons: its section failed, sample data is shown, it left the window,
   * or the window got smaller. So a mark is only dropped when its item is
   * missing and its date is more than KEEP_DAYS in the past. Present items
   * get their date refreshed, so a mark lives as long as its item is seen.
   */
  prune(present: string[]): void {
    const t = today();
    const cutoff = addDays(t, -KEEP_DAYS);
    const stale = addDays(t, -REFRESH_DAYS);
    const here = new Set(present);
    const next = this.marks().flatMap((m): Mark[] => {
      if (here.has(m.id)) return [{ id: m.id, date: m.date < stale ? t : m.date }];
      return m.date < cutoff ? [] : [m];
    });
    // Writes only on a real change (or once, to convert the old format).
    if (JSON.stringify(next) !== JSON.stringify(this.stored())) this.save(next);
  }
}
