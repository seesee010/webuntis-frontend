import type { Lesson } from "@/core/api/types";
import { minutes } from "@/core/dates";

export interface NowNext {
  /** Lessons running right now (parallel groups: several). */
  current: Lesson[];
  /** The lessons with the next start time (today or a later day). */
  next: Lesson[];
  /** Lessons of today that take place, in order. */
  today: Lesson[];
}

/** Lessons that actually take place for the student. */
export function takesPlace(l: Lesson): boolean {
  return !l.cancelled && !l.removed;
}

/** What runs now and what comes next, like `untis --now`. */
export function nowNext(lessons: Lesson[], date: string, nowMin: number): NowNext {
  const real = lessons.filter(takesPlace).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const today = real.filter((l) => l.date === date);
  const current = today.filter((l) => minutes(l.start) <= nowMin && nowMin < minutes(l.end));
  const upcoming = real.filter((l) => l.date > date || (l.date === date && minutes(l.start) > nowMin));
  const first = upcoming[0];
  const next = first ? upcoming.filter((l) => l.date === first.date && l.start === first.start) : [];
  return { current, next, today };
}

/** "1 h 5 min", "12 min". */
export function duration(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}
