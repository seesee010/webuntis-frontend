import type { Change, ChangeKind } from "@/core/api/types";
import { today } from "@/core/dates";
import type { I18n } from "@/core/i18n";

/** Change kinds in the order they appear in the settings, with labels. */
export const changeKinds: { kind: ChangeKind; label: string; defaultOn: boolean }[] = [
  { kind: "cancelled", label: "Cancelled lessons", defaultOn: true },
  { kind: "substitution", label: "Substitutions", defaultOn: true },
  { kind: "room-change", label: "Room changes", defaultOn: true },
  { kind: "removed", label: "Class removed from a lesson", defaultOn: true },
  { kind: "lesson-added", label: "Added lessons", defaultOn: true },
  { kind: "lesson-dropped", label: "Lessons that disappeared", defaultOn: false },
  { kind: "exam-added", label: "New exams", defaultOn: true },
  { kind: "exam-removed", label: "Removed exams", defaultOn: true },
  { kind: "homework-added", label: "New homework", defaultOn: true },
  { kind: "message-new", label: "New messages", defaultOn: true },
];

const titles: Record<ChangeKind, string> = {
  cancelled: "{subject} is cancelled",
  substitution: "Substitution in {subject}",
  "room-change": "Room change for {subject}",
  removed: "Your class was taken out of {subject}",
  "lesson-added": "Additional lesson: {subject}",
  "lesson-dropped": "{subject} was removed from the timetable",
  "exam-added": "New exam: {subject}",
  "exam-removed": "Exam removed: {subject}",
  "homework-added": "New homework in {subject}",
  "message-new": "New message",
};

export interface Described {
  title: string;
  body: string;
}

/** Human text for a change, e.g. "MATH is cancelled" / "Mon 5 Oct, 08:00". */
export function describe(i18n: I18n, c: Change, subjectName: (code: string) => string = (s) => s): Described {
  const subject = c.subject ? c.subject.split(",").map(subjectName).join(" / ") : "";
  const when = [c.date ? `${i18n.relativeDay(c.date, today())} (${i18n.date(c.date, "weekdayDay")})` : "", c.start ? i18n.time(c.start) : ""]
    .filter(Boolean)
    .join(", ");
  return {
    title: i18n.t(titles[c.kind], { subject }),
    body: [when, c.detail].filter(Boolean).join(" · "),
  };
}

/** Is "HH:MM" inside a quiet-hours range that may wrap midnight? */
export function inQuietHours(now: string, from: string, to: string): boolean {
  if (!from || !to || from === to) return false;
  return from < to ? now >= from && now < to : now >= from || now < to;
}
