import type { Holiday } from "@/core/api/types";
import { addDays, daysBetween, isWeekend, range } from "@/core/dates";

/** No school day between the end of one break and the start of the next. */
function touches(prevEnd: string, start: string): boolean {
  for (let d = addDays(prevEnd, 1); d < start; d = addDays(d, 1)) if (!isWeekend(d)) return false;
  return true;
}

/** Merges holidays that overlap or touch (e.g. a public holiday right
 * before a break) into one break, named after its longest part — the
 * same rule as `untis --holidays`. */
export function mergeBreaks(items: Holiday[]): Holiday[] {
  const out: Holiday[] = [];
  const longest: number[] = [];
  for (const h of [...items].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end))) {
    const len = daysBetween(h.start, h.end);
    const last = out[out.length - 1];
    if (last && touches(last.end, h.start)) {
      if (h.end > last.end) last.end = h.end;
      if (len > longest[longest.length - 1]) {
        last.name = h.name;
        longest[longest.length - 1] = len;
      }
    } else {
      out.push({ ...h });
      longest.push(len);
    }
  }
  return out;
}

/** School days (Mon–Fri) from today until the break starts, today
 * included, other holidays not counted. */
export function schoolDaysUntil(h: Holiday, today: string, all: Holiday[]): number {
  if (h.start <= today) return 0;
  return range(today, addDays(h.start, -1)).filter((d) => !isWeekend(d) && !all.some((x) => x.start <= d && d <= x.end)).length;
}

export function upcoming(items: Holiday[], today: string): Holiday[] {
  return items.filter((h) => h.end >= today);
}
