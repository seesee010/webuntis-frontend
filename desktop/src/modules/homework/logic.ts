import type { Homework } from "@/core/api/types";

export type HomeworkState = "overdue" | "open" | "done";

export function stateOf(h: Homework, today: string, doneLocally: boolean): HomeworkState {
  if (h.completed || doneLocally) return "done";
  return h.dueDate < today ? "overdue" : "open";
}

export type HomeworkSort = "due" | "given" | "subject";

/** Open work first (overdue, then by the chosen order), done work last. */
export function sortHomework(items: Homework[], sort: HomeworkSort, state: (h: Homework) => HomeworkState, subject: (h: Homework) => string): Homework[] {
  const rank: Record<HomeworkState, number> = { overdue: 0, open: 1, done: 2 };
  const by = (h: Homework) => (sort === "given" ? h.date : sort === "subject" ? subject(h) + h.dueDate : h.dueDate);
  return [...items].sort((a, b) => rank[state(a)] - rank[state(b)] || by(a).localeCompare(by(b)));
}
