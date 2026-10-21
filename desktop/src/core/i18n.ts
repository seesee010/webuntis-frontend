// Localisation: UI strings and every locale-dependent format.
//
// Strings are looked up gettext style: the English text is the key, so
// code stays readable and a missing translation falls back to English.
// Placeholders use braces: t("in {n} days", { n: 3 }).

import { daysBetween, minutes, parseISO, toISO } from "./dates";
import type { SettingsStore } from "./settings";

export type Lang = "en" | "de";
export type Dictionary = Record<string, string>;

export type DateStyle =
  | "numeric" // 05.10.2026 / 2026-10-05 / 10/05/2026, per the date format setting
  | "dayMonth" // 5 Oct
  | "weekdayDay" // Mon 5 Oct
  | "long" // Monday, 5 October 2026
  | "monthYear"; // October 2026

const dictionaries: Partial<Record<Lang, Dictionary>> = {};

/** Registers a translation table (see src/i18n). */
export function registerDictionary(lang: Lang, dict: Dictionary): void {
  dictionaries[lang] = { ...dictionaries[lang], ...dict };
}

export function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

export class I18n {
  constructor(
    private readonly settings: SettingsStore,
    private readonly systemLocale: () => string = () => navigator.language || "en-GB",
  ) {}

  get lang(): Lang {
    const set = this.settings.get<string>("ui.language", "auto");
    if (set === "de" || set === "en") return set;
    return this.systemLocale().toLowerCase().startsWith("de") ? "de" : "en";
  }

  /** BCP 47 locale for Intl: the system locale if it matches the
   * language (keeps regional formats like de-AT), else a default. */
  get locale(): string {
    const sys = this.systemLocale();
    if (sys.toLowerCase().startsWith(this.lang)) return sys;
    return this.lang === "de" ? "de-DE" : "en-GB";
  }

  t(text: string, params?: Record<string, string | number>): string {
    return interpolate(dictionaries[this.lang]?.[text] ?? text, params);
  }

  /** First day of the week, 0 = Monday … 6 = Sunday. */
  firstDay(): number {
    const set = this.settings.get<string>("ui.firstDay", "auto");
    if (set !== "auto") return Number(set);
    // Intl.Locale#weekInfo is not everywhere yet; fall back to Monday,
    // except for the regions that famously start on Sunday.
    const info = (new Intl.Locale(this.locale) as Intl.Locale & { weekInfo?: { firstDay: number } }).weekInfo;
    if (info) return (info.firstDay + 6) % 7;
    return /-(US|CA|JP|BR|IL|MX|PH)$/i.test(this.locale) ? 6 : 0;
  }

  /** 24 hour clock? */
  private hour24(): boolean {
    const set = this.settings.get<string>("ui.clock", "auto");
    if (set !== "auto") return set === "24";
    return !new Intl.DateTimeFormat(this.locale, { hour: "numeric" }).resolvedOptions().hour12;
  }

  /** "07:50" in the user's clock: "07:50" or "7:50 AM". */
  time(hhmm: string): string {
    if (!hhmm || this.hour24()) return hhmm;
    const m = minutes(hhmm);
    const h = Math.floor(m / 60);
    const suffix = h < 12 ? "AM" : "PM";
    return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, "0")} ${suffix}`;
  }

  timeRange(start: string, end?: string): string {
    return end ? `${this.time(start)}–${this.time(end)}` : this.time(start);
  }

  date(iso: string, style: DateStyle = "numeric"): string {
    const d = parseISO(iso);
    const f = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString(this.locale, o);
    switch (style) {
      case "numeric": {
        const fmt = this.settings.get<string>("ui.dateFormat", "locale");
        const [y, m, day] = toISO(d).split("-");
        if (fmt === "iso") return `${y}-${m}-${day}`;
        if (fmt === "dmy") return `${day}.${m}.${y}`;
        if (fmt === "mdy") return `${m}/${day}/${y}`;
        return f({ day: "2-digit", month: "2-digit", year: "numeric" });
      }
      case "dayMonth":
        return f({ day: "numeric", month: "short" });
      case "weekdayDay":
        return f({ weekday: "short", day: "numeric", month: "short" });
      case "long":
        return f({ weekday: "long", day: "numeric", month: "long", year: "numeric" });
      case "monthYear":
        return f({ month: "long", year: "numeric" });
    }
  }

  /** Day and month only, e.g. "05.10." or "10/05". */
  shortNumeric(iso: string): string {
    return parseISO(iso).toLocaleDateString(this.locale, { day: "2-digit", month: "2-digit" });
  }

  weekday(iso: string, width: "short" | "long" = "short"): string {
    return parseISO(iso).toLocaleDateString(this.locale, { weekday: width });
  }

  dateTime(stamp: string): string {
    const d = new Date(stamp);
    return `${this.date(toISO(d))} ${this.time(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`)}`;
  }

  /** "today", "tomorrow", "in 3 days" — or an absolute date when the
   * user turned relative dates off. */
  relativeDay(iso: string, from: string): string {
    if (!this.settings.get<boolean>("ui.relativeDates", true)) return this.date(iso, "dayMonth");
    const rtf = new Intl.RelativeTimeFormat(this.locale, { numeric: "auto" });
    return rtf.format(daysBetween(from, iso), "day");
  }

  /** "12 min", "1 h 5 min". */
  duration(mins: number): string {
    const m = Math.max(0, Math.round(mins));
    if (m < 60) return this.t("{n} min", { n: m });
    const h = Math.floor(m / 60);
    return m % 60 ? this.t("{h} h {m} min", { h, m: m % 60 }) : this.t("{h} h", { h });
  }

  /** "1 lesson" / "3 lessons" style plurals. */
  plural(n: number, one: string, other: string): string {
    return this.t(n === 1 ? one : other, { n });
  }
}
