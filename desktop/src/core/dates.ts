// Date helpers. Dates travel as ISO strings ("2026-10-05") and times as
// "HH:MM"; both are interpreted in local time.

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function today(): string {
  return toISO(new Date());
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(iso: string): number {
  return (parseISO(iso).getDay() + 6) % 7;
}

/** First day of the week containing iso; firstDay 0 = Monday, 6 = Sunday. */
export function startOfWeek(iso: string, firstDay = 0): string {
  const offset = (weekdayIndex(iso) - firstDay + 7) % 7;
  return addDays(iso, -offset);
}

export function isWeekend(iso: string): boolean {
  return weekdayIndex(iso) >= 5;
}

/** ISO 8601 week number. */
export function isoWeek(iso: string): number {
  const d = parseISO(iso);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const jan4 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
}

/** "07:50" -> 470. */
export function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** 470 -> "07:50". */
export function hhmm(mins: number): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(mins / 60))}:${p(mins % 60)}`;
}

export function nowMinutes(d = new Date()): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function range(fromISO: string, toISO_: string): string[] {
  const out: string[] = [];
  for (let d = fromISO; d <= toISO_; d = addDays(d, 1)) out.push(d);
  return out;
}
