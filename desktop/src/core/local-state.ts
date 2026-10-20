import type { SettingsStore } from "./settings";

/**
 * GUI-only marks (homework done, message read) that WebUntis does not
 * know about. They are stored in the settings document under "state.*",
 * so they survive restarts and travel with exported settings.
 */
export class IdSet {
  constructor(
    private readonly settings: SettingsStore,
    private readonly key: string,
  ) {}

  private ids(): string[] {
    return this.settings.get<string[]>(this.key, []);
  }

  has(id: string): boolean {
    return this.ids().includes(id);
  }

  set(id: string, on: boolean): void {
    const rest = this.ids().filter((x) => x !== id);
    this.settings.set(this.key, on ? [...rest, id] : rest);
  }

  toggle(id: string): void {
    this.set(id, !this.has(id));
  }

  /** Drops ids no longer present, so the list cannot grow forever. */
  prune(existing: string[]): void {
    const keep = this.ids().filter((id) => existing.includes(id));
    if (keep.length !== this.ids().length) this.settings.set(this.key, keep);
  }
}
