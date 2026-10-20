import { defineModule } from "@/core/module";
import type { SettingsStore } from "@/core/settings";
import { renderTimetable } from "./view";
import "./timetable.css";

const periods = (s: SettingsStore) => s.get("timetable.layout") !== "proportional";

export default defineModule({
  id: "timetable",
  title: "Timetable",
  icon: "calendar",
  order: 20,
  route: { path: "/timetable", render: renderTimetable },
  settings: [
    {
      id: "timetable",
      title: "Timetable",
      icon: "calendar",
      order: 20,
      fields: [
        {
          key: "timetable.defaultMode", type: "segmented", label: "Default view", default: "week",
          options: [{ value: "week", label: "Week" }, { value: "day", label: "Day" }],
        },
        {
          key: "timetable.weekends", type: "segmented", label: "Weekends", default: "auto",
          description: "Auto shows Saturday and Sunday only when there are lessons.",
          options: [{ value: "auto", label: "Auto" }, { value: "always", label: "Always" }, { value: "never", label: "Never" }],
        },
        {
          key: "timetable.layout", type: "segmented", label: "Vertical scale", default: "periods",
          description: "Periods gives every period the same height; Time draws true durations, breaks included.",
          options: [{ value: "periods", label: "Periods" }, { value: "proportional", label: "Time" }],
        },
        { key: "timetable.rowHeight", type: "range", label: "Period height", default: 64, min: 32, max: 140, step: 2, unit: " px", visibleIf: periods },
        { key: "timetable.breakHeight", type: "range", label: "Break height", default: 6, min: 0, max: 40, unit: " px", visibleIf: periods },
        { key: "timetable.firstPeriod", type: "number", label: "First period shown", description: "0 shows all.", default: 0, min: 0, max: 20, visibleIf: periods },
        { key: "timetable.lastPeriod", type: "number", label: "Last period shown", description: "0 shows all.", default: 0, min: 0, max: 20, visibleIf: periods },
        { key: "timetable.pxPerMinute", type: "range", label: "Pixels per minute", default: 1.2, min: 0.5, max: 3, step: 0.1, visibleIf: (s) => !periods(s) },
        { key: "timetable.showPeriodNumbers", type: "toggle", label: "Period numbers", default: true },
        { key: "timetable.showPeriodTimes", type: "toggle", label: "Period times", default: true, visibleIf: periods },
        { key: "timetable.showRoom", type: "toggle", label: "Show room", default: true },
        { key: "timetable.showTeacher", type: "toggle", label: "Show teacher", default: true },
        { key: "timetable.showTime", type: "toggle", label: "Show lesson time", default: false },
        { key: "timetable.showStatusLabel", type: "toggle", label: "Status label", description: "Write \"Cancelled\", \"Exam\", … in the cell.", default: true },
        { key: "timetable.mergeAdjacent", type: "toggle", label: "Merge double lessons", description: "Join consecutive identical lessons into one cell.", default: true },
        { key: "timetable.hideCancelled", type: "toggle", label: "Hide cancelled lessons", default: false },
        { key: "timetable.hideRemoved", type: "toggle", label: "Hide lessons your class was removed from", default: false },
        { key: "timetable.showHolidays", type: "toggle", label: "Mark holidays", default: true },
        { key: "timetable.highlightToday", type: "toggle", label: "Highlight today", default: true },
        { key: "timetable.nowLine", type: "toggle", label: "Current time line", default: true },
        { key: "timetable.dimPast", type: "toggle", label: "Dim past lessons", default: true },
        { key: "timetable.compact", type: "toggle", label: "Compact cells", description: "Smaller padding and one-line meta data.", default: false },
        { key: "timetable.fontScale", type: "range", label: "Cell text size", default: 1, min: 0.7, max: 1.4, step: 0.05, unit: "×" },
      ],
    },
  ],
});
