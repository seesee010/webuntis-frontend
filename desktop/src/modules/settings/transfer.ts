// What Export, Copy JSON and Import may carry between machines and people.
import type { SettingsDocument } from "@/core/api/types";
import { getPath } from "@/core/settings";

/**
 * Settings that belong to this machine: untisd runs `binary` with
 * `extraArgs` and points the CLI at these config and credential files.
 * They leak local paths and user names when shared, and a shared file must
 * never change them unnoticed.
 */
export const MACHINE_KEYS = ["backend.cli.binary", "backend.cli.extraArgs", "backend.cli.configPath", "backend.cli.envPath"];

/** Not machine-bound, but arbitrary CSS can change what the app shows. */
const CSS_KEY = "ui.theme.customCss";

/** Local data, not settings: notification history, done/read marks, the last page. */
const LOCAL_DATA = "state";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Sets or (for undefined) removes path in doc, in place. */
function put(doc: SettingsDocument, path: string, value: unknown): void {
  const keys = path.split(".");
  let cur = doc as Record<string, unknown>;
  for (const k of keys.slice(0, -1)) {
    if (!cur[k] || typeof cur[k] !== "object" || Array.isArray(cur[k])) {
      if (value === undefined) return;
      cur[k] = {};
    }
    cur = cur[k] as Record<string, unknown>;
  }
  const last = keys[keys.length - 1];
  if (value === undefined) delete cur[last];
  else cur[last] = structuredClone(value);
}

/** The document as Export and Copy JSON share it: without local data and machine settings. */
export function shareable(doc: SettingsDocument): SettingsDocument {
  const out = structuredClone(doc);
  delete out[LOCAL_DATA];
  for (const key of MACHINE_KEYS) put(out, key, undefined);
  return out;
}

export interface ImportPlan {
  /** The settings the file would change that need the user's consent, with the file's values. */
  risky: { key: string; value: unknown }[];
  /** The document to store; accept decides whether the risky changes are taken. */
  result(accept: boolean): SettingsDocument;
}

/**
 * Plans importing file over current. Import replaces the settings, except:
 * - local data (history, marks) stays as it is: a shared theme must not wipe it;
 * - machine settings the file does not have stay as they are, since files
 *   are exported without them;
 * - machine settings and the custom stylesheet the file does change are only
 *   taken when the user accepts them (risky).
 */
export function planImport(current: SettingsDocument, file: SettingsDocument): ImportPlan {
  const base = structuredClone(file);
  put(base, LOCAL_DATA, current[LOCAL_DATA]);
  const risky: ImportPlan["risky"] = [];
  for (const key of MACHINE_KEYS) {
    const value = getPath(file, key);
    if (value === undefined) put(base, key, getPath(current, key));
    else if (!same(value, getPath(current, key))) risky.push({ key, value });
  }
  const css = getPath(file, CSS_KEY);
  if (typeof css === "string" && css.trim() !== "" && !same(css, getPath(current, CSS_KEY))) risky.push({ key: CSS_KEY, value: css });
  return {
    risky,
    result(accept) {
      const doc = structuredClone(base);
      if (!accept) for (const { key } of risky) put(doc, key, getPath(current, key));
      return doc;
    },
  };
}

/** A setting's value for the confirmation dialog, cut to a readable length. */
export function preview(value: unknown, max = 120): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
