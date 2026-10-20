import { Signal, type ReadSignal } from "./reactive";

export type ToastKind = "info" | "success" | "warning" | "error";

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
  /** Milliseconds until it disappears; 0 keeps it until dismissed. */
  timeout: number;
}

export class Toasts {
  private readonly list = new Signal<Toast[]>([]);
  private next = 1;

  get items(): ReadSignal<Toast[]> {
    return this.list;
  }

  show(kind: ToastKind, title: string, body?: string, timeout = 5000): number {
    const id = this.next++;
    this.list.update((l) => [...l, { id, kind, title, body, timeout }]);
    if (timeout > 0) window.setTimeout(() => this.dismiss(id), timeout);
    return id;
  }

  dismiss(id: number): void {
    this.list.update((l) => l.filter((t) => t.id !== id));
  }
}
