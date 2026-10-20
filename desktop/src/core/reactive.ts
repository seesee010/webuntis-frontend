// A deliberately tiny reactivity layer: signals with explicit
// subscriptions and scopes that collect cleanups. No framework needed.

export type Unsubscribe = () => void;

export interface ReadSignal<T> {
  get(): T;
  /** Calls fn with the current value right away, then on every change. */
  subscribe(fn: (value: T) => void, immediate?: boolean): Unsubscribe;
}

export class Signal<T> implements ReadSignal<T> {
  private subs = new Set<(value: T) => void>();

  constructor(
    private value: T,
    private readonly equals: (a: T, b: T) => boolean = Object.is,
  ) {}

  get(): T {
    return this.value;
  }

  set(value: T): void {
    if (this.equals(this.value, value)) return;
    this.value = value;
    for (const fn of [...this.subs]) fn(value);
  }

  update(fn: (value: T) => T): void {
    this.set(fn(this.value));
  }

  subscribe(fn: (value: T) => void, immediate = true): Unsubscribe {
    this.subs.add(fn);
    if (immediate) fn(this.value);
    return () => this.subs.delete(fn);
  }
}

/** A signal derived from others; recomputed whenever a dependency changes. */
export function computed<T>(deps: ReadSignal<unknown>[], fn: () => T): ReadSignal<T> {
  const out = new Signal<T>(fn());
  for (const d of deps) d.subscribe(() => out.set(fn()), false);
  return out;
}

/** Collects cleanups (subscriptions, timers, listeners) of a view or
 * module so they can be released together. */
export class Scope {
  private cleanups: (() => void)[] = [];
  private disposed = false;

  add(cleanup: () => void): void {
    if (this.disposed) cleanup();
    else this.cleanups.push(cleanup);
  }

  /** Subscribes and releases the subscription with the scope. */
  watch<T>(signal: ReadSignal<T>, fn: (value: T) => void, immediate = true): void {
    this.add(signal.subscribe(fn, immediate));
  }

  interval(fn: () => void, ms: number): void {
    const id = window.setInterval(fn, ms);
    this.add(() => window.clearInterval(id));
  }

  listen<K extends keyof WindowEventMap>(target: Window, type: K, fn: (ev: WindowEventMap[K]) => void): void;
  listen(target: EventTarget, type: string, fn: (ev: Event) => void): void;
  listen(target: EventTarget, type: string, fn: (ev: Event) => void): void {
    target.addEventListener(type, fn);
    this.add(() => target.removeEventListener(type, fn));
  }

  child(): Scope {
    const s = new Scope();
    this.add(() => s.dispose());
    return s;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const c of this.cleanups.reverse()) c();
    this.cleanups = [];
  }
}
