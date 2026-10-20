// TypeScript mirror of the backend's domain model (backend/internal/domain).

export type LessonStatus =
  | "regular"
  | "cancelled"
  | "removed"
  | "exam"
  | "event"
  | "substitution"
  | "additional"
  | "no-teacher";

export interface Element {
  short: string;
  long?: string;
  status?: string;
  replaces?: string;
  replacesLong?: string;
}

export interface Lesson {
  id: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string; // HH:MM
  status: LessonStatus;
  cancelled: boolean;
  removed: boolean;
  exam: boolean;
  event: boolean;
  substitution: boolean;
  noTeacher: boolean;
  subjects: Element[];
  teachers: Element[];
  rooms: Element[];
  classes: Element[];
  text?: string;
  info?: string;
  substitutionText?: string;
  notes?: string;
}

export interface Period {
  index: number;
  start: string;
  end: string;
}

export interface Exam {
  id: string;
  date: string;
  start?: string;
  end?: string;
  name?: string;
  type?: string;
  text?: string;
  grade?: string;
  subjects: Element[];
  teachers: Element[];
  rooms: Element[];
}

export interface Attachment {
  id?: string;
  name: string;
  url?: string;
}

export interface Homework {
  id: string;
  date: string;
  dueDate: string;
  text: string;
  remark?: string;
  completed: boolean;
  subjects: Element[];
  teachers: Element[];
  attachments: Attachment[];
}

export interface Absence {
  id: string;
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  reason?: string;
  text?: string;
  excused: boolean;
  excuseStatus?: string;
  excuseText?: string;
}

export interface Message {
  id: string;
  subject: string;
  preview?: string;
  from?: string;
  date?: string;
  read: boolean;
  hasAttachments: boolean;
}

export interface Holiday {
  id: string;
  name: string;
  start: string;
  end: string;
}

export interface Meta {
  provider: string;
  school?: string;
  server?: string;
  user?: string;
  from: string;
  to: string;
  note?: string;
  ownClasses: string[];
  fetchedAt: string;
  timetableSource?: string;
}

export interface Snapshot {
  meta: Meta;
  timeGrid: Period[];
  lessons: Lesson[];
  exams: Exam[];
  homework: Homework[];
  absences: Absence[];
  messages: Message[];
  holidays: Holiday[];
  errors: Record<string, string>;
}

export interface Lookup {
  code: string;
  kind: "subject" | "teacher" | "room" | "class";
  name: string;
}

export type ChangeKind =
  | "cancelled"
  | "substitution"
  | "room-change"
  | "removed"
  | "lesson-added"
  | "lesson-dropped"
  | "exam-added"
  | "exam-removed"
  | "homework-added"
  | "message-new";

export interface Change {
  kind: ChangeKind;
  date?: string;
  start?: string;
  subject?: string;
  detail?: string;
  ref?: string;
}

export type ErrorKind =
  | "config"
  | "login"
  | "unreachable"
  | "not-found"
  | "no-school"
  | "cancelled"
  | "internal"
  | "bad-request"
  | "unauthorized"
  | "network";

export interface ErrorInfo {
  kind: ErrorKind;
  message: string;
  at?: string;
}

export interface ServiceStatus {
  provider: string;
  lastRefresh: string | null;
  nextRefresh: string | null;
  lastError: ErrorInfo | null;
  backend: Record<string, unknown>;
}

export interface Status {
  version: string;
  settingsPath: string;
  service: ServiceStatus;
  cliVersion?: string;
  cliError?: ErrorInfo;
}

export type SettingsDocument = Record<string, unknown>;

export interface BackendEvent<T = unknown> {
  type: "snapshot" | "changes" | "error" | "settings" | "provider";
  at: string;
  data?: T;
}
