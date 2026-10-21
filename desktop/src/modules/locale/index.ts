import { defineModule } from "@/core/module";

/** Language, calendar and clock preferences; applied by core/i18n. */
export default defineModule({
  id: "locale",
  title: "Language & formats",
  icon: "globe",
  settings: [
    {
      id: "locale",
      title: "Language & formats",
      icon: "globe",
      order: 3,
      fields: [
        {
          key: "ui.language", type: "segmented", label: "Language", default: "auto", keywords: ["deutsch", "english", "sprache"],
          options: [{ value: "auto", label: "System" }, { value: "en", label: "English" }, { value: "de", label: "Deutsch" }],
        },
        {
          key: "ui.firstDay", type: "select", label: "First day of the week", default: "auto",
          options: [{ value: "auto", label: "From language" }, { value: "0", label: "Monday" }, { value: "6", label: "Sunday" }, { value: "5", label: "Saturday" }],
        },
        {
          key: "ui.clock", type: "segmented", label: "Clock", default: "auto",
          options: [{ value: "auto", label: "From language" }, { value: "24", label: "24 hours" }, { value: "12", label: "12 hours" }],
        },
        {
          key: "ui.dateFormat", type: "select", label: "Date format", default: "locale",
          options: [
            { value: "locale", label: "From language" },
            { value: "dmy", label: "31.12.2026" },
            { value: "mdy", label: "12/31/2026" },
            { value: "iso", label: "2026-12-31" },
          ],
        },
        { key: "ui.relativeDates", type: "toggle", label: "Relative dates", description: "Write \"tomorrow\" or \"in 3 days\" instead of the date.", default: true },
      ],
    },
  ],
});
