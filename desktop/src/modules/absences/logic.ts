import type { Absence, Period } from "@/core/api/types";
import { isWeekend, minutes, range } from "@/core/dates";

/** Lessons an absence covers: every period of the time grid it overlaps,
 * on every weekday of its range (like `untis --absences`). */
export function missedLessons(a: Absence, grid: Period[]): number {
  let n = 0;
  for (const day of range(a.startDate, a.endDate)) {
    if (isWeekend(day)) continue;
    const from = day === a.startDate && a.startTime ? minutes(a.startTime) : 0;
    const to = day === a.endDate && a.endTime ? minutes(a.endTime) : 24 * 60;
    n += grid.filter((p) => minutes(p.start) < to && minutes(p.end) > from).length;
  }
  return n;
}

export function schoolDays(a: Absence): number {
  return range(a.startDate, a.endDate).filter((d) => !isWeekend(d)).length;
}

export interface AbsenceTotals {
  count: number;
  days: number;
  lessons: number;
  unexcused: number;
}

export function totals(list: Absence[], grid: Period[]): AbsenceTotals {
  return {
    count: list.length,
    days: list.reduce((n, a) => n + schoolDays(a), 0),
    lessons: list.reduce((n, a) => n + missedLessons(a, grid), 0),
    unexcused: list.filter((a) => !a.excused).length,
  };
}
