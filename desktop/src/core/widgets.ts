// Dashboard widgets. Any module can contribute widgets; the dashboard
// lists them, and the user decides which are shown, in which order and
// how wide.

import type { AppContext } from "./app";
import type { IconName } from "./icons";
import type { Scope } from "./reactive";

export type WidgetSize = "small" | "medium" | "large" | "full";

export interface WidgetDef {
  id: string;
  title: string;
  icon: IconName;
  description?: string;
  size?: WidgetSize;
  /** Shown on a fresh install (default true). */
  enabledByDefault?: boolean;
  /** Renders the widget body; the dashboard draws the frame. */
  render(ctx: AppContext, scope: Scope): HTMLElement;
}

declare module "./module" {
  interface ModuleDef {
    widgets?: WidgetDef[];
  }
}

/** The user's dashboard layout, stored in "dashboard.layout". */
export interface WidgetSlot {
  id: string;
  enabled: boolean;
  size: WidgetSize;
}

export function allWidgets(ctx: AppContext): WidgetDef[] {
  return ctx.modules.all().flatMap((m) => m.widgets ?? []);
}

/**
 * Merges the stored layout with the available widgets: unknown ids
 * (from removed modules) are dropped, new widgets are appended with
 * their defaults.
 */
export function resolveLayout(available: WidgetDef[], stored: WidgetSlot[] | undefined): WidgetSlot[] {
  const known = new Map(available.map((w) => [w.id, w]));
  const out = (stored ?? []).filter((s) => known.has(s.id));
  for (const w of available) {
    if (!out.some((s) => s.id === w.id)) out.push({ id: w.id, enabled: w.enabledByDefault ?? true, size: w.size ?? "medium" });
  }
  return out;
}
