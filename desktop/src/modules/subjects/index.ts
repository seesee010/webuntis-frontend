import { defineModule } from "@/core/module";
import { subjectEditor } from "./editor";

const nameOptions = [
  { value: "short", label: "Code" },
  { value: "long", label: "Full name" },
  { value: "both", label: "Both" },
];

/** Naming, per-subject overrides and filters. The Display service in
 * core applies them in every view. */
export default defineModule({
  id: "subjects",
  title: "Subjects",
  icon: "tag",
  settings: [
    {
      id: "subjects",
      title: "Subjects",
      icon: "tag",
      order: 25,
      description: "Rename, colour or hide subjects. Changes only affect this app.",
      fields: [
        { key: "subjects.custom", type: "custom", label: "Subjects", default: {}, render: subjectEditor, keywords: ["rename", "emoji", "colour", "color", "hide"] },
        {
          key: "subjects.colorMode", type: "segmented", label: "Colour lessons by", default: "status",
          description: "Status keeps WebUntis' meaning; Subject colours regular lessons by subject; Always colours every lesson by subject.",
          options: [{ value: "status", label: "Status" }, { value: "subject", label: "Subject" }, { value: "always", label: "Always subject" }],
        },
      ],
    },
    {
      id: "names",
      title: "Names",
      icon: "tag",
      order: 26,
      fields: [
        { key: "ui.names.subjects", type: "segmented", label: "Subjects", default: "short", options: nameOptions },
        { key: "ui.names.teachers", type: "segmented", label: "Teachers", default: "short", options: nameOptions },
        { key: "ui.names.rooms", type: "segmented", label: "Rooms", default: "short", options: nameOptions },
      ],
    },
    {
      id: "filters",
      title: "Filters",
      icon: "eye-off",
      order: 27,
      description: "Applied everywhere: timetable, dashboard, exams and homework.",
      fields: [
        {
          key: "filters.mode", type: "segmented", label: "Subject filter", default: "none",
          description: "Only shows just the listed subjects; Except hides them (like untis --only / --except).",
          options: [{ value: "none", label: "Off" }, { value: "only", label: "Only" }, { value: "except", label: "Except" }],
        },
        { key: "filters.subjects", type: "list", label: "Filtered subjects", description: "Codes or full names; press Enter to add.", default: [], placeholder: "MATH", visibleIf: (s) => s.get("filters.mode") !== "none" },
        { key: "filters.hideCancelled", type: "toggle", label: "Hide cancelled lessons everywhere", default: false },
        { key: "filters.hideRemoved", type: "toggle", label: "Hide lessons your class was removed from", default: false },
      ],
    },
  ],
});
