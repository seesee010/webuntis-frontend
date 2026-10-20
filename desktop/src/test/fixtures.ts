// Made-up test data (fictional school, see backend sample provider).
import type { Lesson, Snapshot } from "@/core/api/types";

export function lesson(date: string, start: string, end: string, subject: string, extra: Partial<Lesson> = {}): Lesson {
  return {
    id: `${date}-${start}-${subject}`, date, start, end, status: "regular",
    cancelled: false, removed: false, exam: false, event: false, substitution: false, noTeacher: false,
    subjects: [{ short: subject, long: `${subject} long` }], teachers: [{ short: "AMB", long: "Ms. Ambrose" }],
    rooms: [{ short: "R101" }], classes: [{ short: "3B" }], ...extra,
  };
}

export function snapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    meta: { provider: "sample", from: "2026-10-05", to: "2026-10-11", ownClasses: ["3B"], fetchedAt: "2026-10-07T08:00:00" },
    timeGrid: [
      { index: 1, start: "08:00", end: "08:50" },
      { index: 2, start: "08:55", end: "09:45" },
      { index: 3, start: "10:00", end: "10:50" },
    ],
    lessons: [
      lesson("2026-10-05", "08:00", "08:50", "MATH"),
      lesson("2026-10-05", "08:55", "09:45", "MATH"),
      lesson("2026-10-06", "08:00", "08:50", "GEO", { status: "cancelled", cancelled: true }),
      lesson("2026-10-06", "08:55", "09:45", "CS"),
      lesson("2026-10-06", "08:55", "09:45", "ART"),
      lesson("2026-10-07", "10:00", "10:50", "ENG", { status: "exam", exam: true }),
    ],
    exams: [], homework: [], absences: [], messages: [], holidays: [], errors: {},
    ...over,
  };
}
