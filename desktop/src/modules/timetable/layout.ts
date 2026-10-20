// Pure layout logic of the timetable grid (no DOM), unit tested.

import type { Lesson, Period } from "@/core/api/types";
import { hhmm, minutes } from "@/core/dates";

export interface Mark {
  kind: "period" | "hour";
  label: string;
  sub?: string;
  top: number;
  height: number;
}

/** Maps a time of day (in minutes) to a vertical position. */
export interface Axis {
  height: number;
  y(min: number): number;
  marks: Mark[];
}

/**
 * Every period gets the same height and breaks shrink to `gap`, so a
 * day with long breaks does not waste space. Times inside a period or a
 * break are interpolated linearly.
 */
export function periodAxis(grid: Period[], rowHeight: number, gap: number): Axis {
  const ps = grid.map((p) => ({ ...p, s: minutes(p.start), e: minutes(p.end) }));
  const top = (i: number) => i * (rowHeight + gap);
  const height = ps.length ? top(ps.length) - gap : 0;

  const y = (t: number): number => {
    if (!ps.length || t <= ps[0].s) return 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (t <= p.e) return top(i) + ((t - p.s) / Math.max(1, p.e - p.s)) * rowHeight;
      const next = ps[i + 1];
      if (next && t < next.s) return top(i) + rowHeight + ((t - p.e) / Math.max(1, next.s - p.e)) * gap;
    }
    return height;
  };

  return {
    height,
    y,
    marks: ps.map((p, i) => ({ kind: "period", label: String(p.index || i + 1), sub: `${p.start}\n${p.end}`, top: top(i), height: rowHeight })),
  };
}

/** A true time scale: pxPerMinute pixels for every minute. */
export function linearAxis(startMin: number, endMin: number, pxPerMinute: number): Axis {
  const s = Math.floor(startMin / 60) * 60;
  const e = Math.ceil(endMin / 60) * 60;
  const marks: Mark[] = [];
  for (let t = s; t < e; t += 60) marks.push({ kind: "hour", label: hhmm(t), top: (t - s) * pxPerMinute, height: 60 * pxPerMinute });
  return {
    height: (e - s) * pxPerMinute,
    y: (t) => (Math.min(Math.max(t, s), e) - s) * pxPerMinute,
    marks,
  };
}

/** The school's time grid, or one derived from the lessons themselves. */
export function effectiveGrid(grid: Period[], lessons: Lesson[]): Period[] {
  if (grid.length) return grid;
  const seen = new Map<string, Period>();
  for (const l of lessons) seen.set(`${l.start}-${l.end}`, { index: 0, start: l.start, end: l.end });
  return [...seen.values()]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((p, i) => ({ ...p, index: i + 1 }));
}

/** Restricts the grid to periods first..last (1-based, 0 = no limit). */
export function clipGrid(grid: Period[], first: number, last: number): Period[] {
  return grid.filter((_, i) => (first <= 0 || i + 1 >= first) && (last <= 0 || i + 1 <= last));
}

export interface Placed<T> {
  item: T;
  col: number;
  cols: number;
}

/**
 * Lays overlapping lessons out side by side. Lessons that overlap
 * (directly or through a chain) form a cluster; each gets the first free
 * column, and all lessons of a cluster share the cluster's column count.
 */
export function assignColumns<T extends { start: string; end: string }>(items: T[]): Placed<T>[] {
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end));
  const out: Placed<T>[] = [];
  let cluster: Placed<T>[] = [];
  let colEnds: string[] = [];
  let clusterEnd = "";

  const flush = () => {
    for (const p of cluster) p.cols = colEnds.length;
    out.push(...cluster);
    cluster = [];
    colEnds = [];
  };

  for (const item of sorted) {
    if (cluster.length && item.start >= clusterEnd) flush();
    let col = colEnds.findIndex((end) => end <= item.start);
    if (col === -1) col = colEnds.push(item.end) - 1;
    else colEnds[col] = item.end;
    cluster.push({ item, col, cols: 0 });
    clusterEnd = cluster.length === 1 ? item.end : clusterEnd > item.end ? clusterEnd : item.end;
  }
  flush();
  return out;
}

function sameLesson(a: Lesson, b: Lesson): boolean {
  const key = (l: Lesson) =>
    JSON.stringify([l.status, l.subjects, l.teachers, l.rooms, l.classes, l.info, l.text, l.substitutionText]);
  return a.date === b.date && key(a) === key(b);
}

/**
 * Merges consecutive identical lessons (a double lesson the API sends as
 * two entries) into one, if the gap between them is at most maxGap minutes.
 */
export function mergeAdjacent(lessons: Lesson[], maxGap = 15): Lesson[] {
  const sorted = [...lessons].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const out: Lesson[] = [];
  for (const l of sorted) {
    const merged = [...out].reverse().find((p) => sameLesson(p, l) && minutes(l.start) - minutes(p.end) >= 0 && minutes(l.start) - minutes(p.end) <= maxGap);
    if (merged) merged.end = l.end > merged.end ? l.end : merged.end;
    else out.push({ ...l });
  }
  return out;
}
