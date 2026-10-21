import { describe, expect, it } from "vitest";
import { I18n, interpolate, registerDictionary } from "./i18n";
import { SettingsStore } from "./settings";
import type { ApiClient } from "./api/client";

function i18n(settings: Record<string, unknown> = {}, system = "en-GB"): I18n {
  const store = new SettingsStore({} as ApiClient);
  for (const [k, v] of Object.entries(settings)) store.registerDefault(k, v);
  return new I18n(store, () => system);
}

registerDictionary("de", { "Hello {name}": "Hallo {name}" });

describe("language", () => {
  it("follows the system in auto mode and can be forced", () => {
    expect(i18n({}, "de-AT").lang).toBe("de");
    expect(i18n({}, "de-AT").locale).toBe("de-AT");
    expect(i18n({ "ui.language": "de" }, "en-US").locale).toBe("de-DE");
    expect(i18n({ "ui.language": "en" }, "de-DE").lang).toBe("en");
  });

  it("translates with fallback and placeholders", () => {
    expect(i18n({ "ui.language": "de" }).t("Hello {name}", { name: "Sam" })).toBe("Hallo Sam");
    expect(i18n({ "ui.language": "de" }).t("Untranslated {n}", { n: 1 })).toBe("Untranslated 1");
    expect(i18n().t("Hello {name}", { name: "Sam" })).toBe("Hello Sam");
    expect(interpolate("{a} {missing}", { a: 1 })).toBe("1 {missing}");
  });
});

describe("formats", () => {
  it("writes times in the chosen clock", () => {
    expect(i18n({ "ui.clock": "24" }).time("07:50")).toBe("07:50");
    expect(i18n({ "ui.clock": "12" }).time("07:50")).toBe("7:50 AM");
    expect(i18n({ "ui.clock": "12" }).time("12:05")).toBe("12:05 PM");
    expect(i18n({ "ui.clock": "12" }).time("00:10")).toBe("12:10 AM");
    expect(i18n({ "ui.clock": "auto" }, "en-US").time("13:00")).toBe("1:00 PM");
    expect(i18n({ "ui.clock": "24" }).timeRange("07:50", "08:40")).toBe("07:50–08:40");
  });

  it("writes numeric dates in the chosen format", () => {
    expect(i18n({ "ui.dateFormat": "iso" }).date("2026-10-05")).toBe("2026-10-05");
    expect(i18n({ "ui.dateFormat": "dmy" }).date("2026-10-05")).toBe("05.10.2026");
    expect(i18n({ "ui.dateFormat": "mdy" }).date("2026-10-05")).toBe("10/05/2026");
    expect(i18n({ "ui.dateFormat": "locale" }, "de-DE").date("2026-10-05")).toBe("05.10.2026");
  });

  it("names days relatively in the user's language", () => {
    expect(i18n().relativeDay("2026-10-06", "2026-10-05")).toBe("tomorrow");
    expect(i18n().relativeDay("2026-10-08", "2026-10-05")).toBe("in 3 days");
    expect(i18n({}, "de-DE").relativeDay("2026-10-06", "2026-10-05")).toBe("morgen");
    expect(i18n({ "ui.relativeDates": false }).relativeDay("2026-10-06", "2026-10-05")).toBe(i18n().date("2026-10-06", "dayMonth"));
  });

  it("formats long dates and weekdays per locale", () => {
    expect(i18n({}, "de-DE").weekday("2026-10-05", "long")).toBe("Montag");
    expect(i18n().date("2026-10-05", "monthYear")).toBe("October 2026");
  });

  it("formats durations and plurals", () => {
    const en = i18n();
    expect([en.duration(12), en.duration(60), en.duration(65)]).toEqual(["12 min", "1 h", "1 h 5 min"]);
    expect(en.plural(1, "{n} lesson", "{n} lessons")).toBe("1 lesson");
    expect(en.plural(3, "{n} lesson", "{n} lessons")).toBe("3 lessons");
  });

  it("picks the first day of the week", () => {
    expect(i18n({ "ui.firstDay": "6" }).firstDay()).toBe(6);
    expect(i18n({ "ui.firstDay": "auto" }, "de-DE").firstDay()).toBe(0);
    expect(i18n({ "ui.firstDay": "auto" }, "en-US").firstDay()).toBe(6);
  });
});
