import type { Exam } from "@/core/api/types";

export interface ExamOptions {
  today: string;
  showPast: boolean;
  /** Only exams up to this many days ahead; 0 = no limit. */
  horizonDays?: number;
}

/** Upcoming exams first (soonest first), then past ones (latest first). */
export function sortExams(exams: Exam[], opt: ExamOptions): { upcoming: Exam[]; past: Exam[] } {
  const key = (e: Exam) => e.date + (e.start ?? "");
  const upcoming = exams.filter((e) => e.date >= opt.today).sort((a, b) => key(a).localeCompare(key(b)));
  const past = opt.showPast ? exams.filter((e) => e.date < opt.today).sort((a, b) => key(b).localeCompare(key(a))) : [];
  return { upcoming, past };
}

export function examTitle(e: Exam): string {
  return e.name || e.type || "Exam";
}
