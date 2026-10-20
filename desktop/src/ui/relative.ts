import { daysBetween, parseISO } from "@/core/dates";

/** "today", "tomorrow", "in 3 days", "yesterday", "5 days ago". */
export function relativeDay(date: string, from: string): string {
  const d = daysBetween(from, date);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}

/** "Mon 5 Oct". */
export function shortDate(date: string): string {
  return parseISO(date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** Groups items by a key, keeping the order in which keys first appear. */
export function groupBy<T>(items: T[], key: (item: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return [...map.entries()];
}

/** "October 2026". */
export function monthLabel(date: string): string {
  return parseISO(date).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
