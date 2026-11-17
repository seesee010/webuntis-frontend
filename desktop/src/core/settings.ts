import { ApiError, type ApiClient } from "./api/client";
import type { SettingsDocument } from "./api/types";
import { Signal, type ReadSignal, type Unsubscribe } from "./reactive";

type Path = string; // dot separated, e.g. "ui.theme.accent"

export function getPath(doc: unknown, path: Path): unknown {
  let cur = doc;
  for (const key of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Builds the nested merge patch {a: {b: value}} for "a.b". */
export function patchFor(path: Path, value: unknown): SettingsDocument {
  const keys = path.split(".");
  const root: SettingsDocument = {};
  let cur = root;
  keys.forEach((k, i) => {
    if (i === keys.length - 1) cur[k] = value;
    else cur = cur[k] = {} as SettingsDocument;
  });
  return root;
}

function setPath(doc: SettingsDocument, path: Path, value: unknown): SettingsDocument {
  const out = structuredClone(doc);
  const keys = path.split(".");
  let cur = out as Record<string, unknown>;
  keys.slice(0, -1).forEach((k) => {
    if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  });
  const last = keys[keys.length - 1];
  if (value === null || value === undefined) delete cur[last];
  else cur[last] = value;
  return out;
}

/** Merges merge patches; unlike applying them, null values are kept so
 * the backend still sees the deletion. */
function combinePatches(a: SettingsDocument, b: SettingsDocument): SettingsDocument {
  const out = structuredClone(a);
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k];
    const isObj = (x: unknown) => !!x && typeof x === "object" && !Array.isArray(x);
    out[k] = isObj(v) && isObj(cur) ? combinePatches(cur as SettingsDocument, v as SettingsDocument) : v;
  }
  return out;
}

/**
 * Whether the backend answered and refused this very patch (larger than its
 * limit, not a JSON object). Sending it again cannot work. Everything else
 * may pass later: no answer at all, a restart, a full disk, a rejected token.
 */
function refused(err: unknown): boolean {
  return err instanceof ApiError && [400, 413, 422].includes(err.status);
}

/**
 * Client-side view of the settings document stored by the backend.
 *
 * Writes are applied locally right away (so the UI reacts instantly) and
 * sent to the backend as merge patches, batched over a short delay. A batch
 * that could not be saved is kept and sent again, before any newer one.
 * Defaults are registered by the settings schemas; get() falls back to
 * them for every missing value.
 */
export class SettingsStore {
  private readonly doc = new Signal<SettingsDocument>({});
  private readonly defaults = new Map<Path, unknown>();
  private pending: SettingsDocument = {};
  /** Batches that still have to be sent, oldest first. */
  private unsent: SettingsDocument[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private sending = false;
  private sent: Promise<void> = Promise.resolve();
  private retryDelay = 0;
  /** Whether a batch was added since a failed save was last reported. */
  private unreported = false;

  /**
   * Called when saving fails. With retrying, the changes are kept and sent
   * again later; this is reported once for the changes made so far, not for
   * every attempt. Without it, the backend refused a change for good and it
   * was dropped.
   */
  onSaveError: ((err: unknown, retrying: boolean) => void) | undefined;

  constructor(private readonly api: ApiClient) {}

  async load(): Promise<void> {
    this.doc.set(await this.api.getSettings());
  }

  /** The raw document (without defaults). */
  get document(): ReadSignal<SettingsDocument> {
    return this.doc;
  }

  registerDefault(path: Path, value: unknown): void {
    this.defaults.set(path, value);
  }

  defaultOf(path: Path): unknown {
    return this.defaults.get(path);
  }

  /** Whether the user set a value (instead of using the default). */
  isSet(path: Path): boolean {
    return getPath(this.doc.get(), path) !== undefined;
  }

  get<T>(path: Path, fallback?: T): T {
    const v = getPath(this.doc.get(), path);
    if (v !== undefined) return v as T;
    if (this.defaults.has(path)) return this.defaults.get(path) as T;
    return fallback as T;
  }

  /** Calls fn with the value of path now and whenever it changes. */
  watch<T>(path: Path, fn: (value: T) => void, fallback?: T): Unsubscribe {
    let last: string | undefined;
    return this.doc.subscribe(() => {
      const v = this.get<T>(path, fallback);
      const key = JSON.stringify(v);
      if (key === last) return;
      last = key;
      fn(v);
    });
  }

  /** Sets a value; undefined or null resets it to its default. */
  set(path: Path, value: unknown): void {
    this.doc.set(setPath(this.doc.get(), path, value));
    this.pending = combinePatches(this.pending, patchFor(path, value ?? null));
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), 250);
  }

  reset(path: Path): void {
    this.set(path, null);
  }

  /**
   * Sends pending changes to the backend. Resolves once nothing changed so
   * far is left to send and rejects when a save fails; the changes are then
   * kept and sent again later (see send()).
   */
  flush(): Promise<void> {
    clearTimeout(this.timer);
    if (Object.keys(this.pending).length > 0) {
      this.unsent.push(this.pending);
      this.pending = {};
      this.unreported = true;
    }
    if (!this.sending && this.unsent.length > 0) {
      this.sending = true;
      this.sent = this.send();
      // The batch timer and the unload handler do not wait for the result.
      this.sent.catch(() => undefined);
    }
    return this.sent;
  }

  /**
   * Sends the waiting batches one after the other, in the order they were
   * made. A batch that fails goes back to the front and is sent again after
   * a growing pause, so one failed save (backend restarting, a network blip,
   * a full disk) neither loses a change nor blocks the later ones, and a
   * newer value is never overwritten by an older one. Batches stay separate
   * because merging two patches is not always the same as applying both.
   */
  private async send(): Promise<void> {
    try {
      while (this.unsent.length > 0) {
        const patch = this.unsent.shift()!;
        try {
          await this.api.patchSettings(patch);
          this.retryDelay = 0;
        } catch (err) {
          if (refused(err)) {
            // Keeping it would fail again and hold back every later batch.
            // Show what is really stored, not a value that was never saved.
            this.retryDelay = 0;
            this.report(err, false);
            void this.reload().catch(() => undefined);
            continue;
          }
          this.unsent.unshift(patch);
          this.retryDelay = Math.min(Math.max(this.retryDelay * 2, 2_000), 60_000);
          clearTimeout(this.timer);
          this.timer = setTimeout(() => void this.flush(), this.retryDelay);
          if (this.unreported) {
            this.unreported = false;
            this.report(err, true);
          }
          throw err;
        }
      }
    } finally {
      this.sending = false;
    }
  }

  private report(err: unknown, retrying: boolean): void {
    try {
      this.onSaveError?.(err, retrying);
    } catch (e) {
      console.error(e); // a failing listener must not stop the saving
    }
  }

  async replace(doc: SettingsDocument): Promise<void> {
    await this.flush();
    this.doc.set(await this.api.replaceSettings(doc));
  }

  async resetAll(): Promise<void> {
    await this.flush();
    this.doc.set(await this.api.resetSettings());
  }

  /**
   * Reloads after a change made elsewhere (e.g. another window), unless local
   * changes still wait to be sent: the reload would hide them. Their own save
   * triggers the next reload.
   */
  async reload(): Promise<void> {
    if (Object.keys(this.pending).length === 0 && this.unsent.length === 0) await this.load();
  }
}
