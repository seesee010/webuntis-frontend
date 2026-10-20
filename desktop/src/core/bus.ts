import type { Unsubscribe } from "./reactive";

/** A typed event emitter. Events maps event names to payload types. */
export class Bus<Events extends Record<string, unknown>> {
  private handlers = new Map<keyof Events, Set<(payload: never) => void>>();

  on<K extends keyof Events>(event: K, fn: (payload: Events[K]) => void): Unsubscribe {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(fn as (payload: never) => void);
    return () => set.delete(fn as (payload: never) => void);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    for (const fn of [...(this.handlers.get(event) ?? [])]) {
      try {
        (fn as (p: Events[K]) => void)(payload);
      } catch (err) {
        console.error(`handler of "${String(event)}" failed`, err);
      }
    }
  }
}
