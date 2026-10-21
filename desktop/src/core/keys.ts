// Keyboard bindings: "mod+k", "shift+?", "g t" (a sequence of two
// strokes). "mod" is Ctrl, or Cmd on macOS. Pure logic, no DOM state.

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const aliases: Record<string, string> = { " ": "space", esc: "escape", del: "delete", return: "enter" };

/** One stroke of a KeyboardEvent as a canonical string, e.g. "mod+shift+k". */
export function strokeOf(ev: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">, mac = isMac()): string {
  let key = ev.key.toLowerCase();
  key = aliases[key] ?? key;
  if (["control", "meta", "alt", "shift"].includes(key)) return "";
  const parts: string[] = [];
  if (mac ? ev.metaKey : ev.ctrlKey) parts.push("mod");
  if (mac && ev.ctrlKey) parts.push("ctrl");
  if (!mac && ev.metaKey) parts.push("meta");
  if (ev.altKey) parts.push("alt");
  // Shift is implied by printable symbols like "?"; keep it for letters
  // and named keys only, so "?" and "shift+/" don't both need binding.
  if (ev.shiftKey && (key.length > 1 || /[a-z]/.test(key))) parts.push("shift");
  parts.push(key);
  return parts.join("+");
}

/** Normalises a user-written binding ("Ctrl+K", "g  t") to canonical form. */
export function normalizeBinding(binding: string): string {
  return binding
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((stroke) => {
      const parts = stroke.split("+").map((p) => (p === "ctrl" && !isMac() ? "mod" : p === "cmd" ? "mod" : aliases[p] ?? p));
      const key = parts.pop()!;
      const order = ["mod", "ctrl", "meta", "alt", "shift"];
      return [...order.filter((m) => parts.includes(m)), key].join("+");
    })
    .join(" ");
}

/** Pretty form for display: "Ctrl+K", "⌘K", "G then T". */
export function formatBinding(binding: string, mac = isMac()): string[] {
  if (!binding) return [];
  return binding.split(" ").map((stroke) =>
    stroke
      .split("+")
      .map((p) => {
        if (p === "mod") return mac ? "⌘" : "Ctrl";
        if (p === "shift") return mac ? "⇧" : "Shift";
        if (p === "alt") return mac ? "⌥" : "Alt";
        if (p === "arrowleft") return "←";
        if (p === "arrowright") return "→";
        if (p === "arrowup") return "↑";
        if (p === "arrowdown") return "↓";
        return p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1);
      })
      .join(mac ? "" : "+"),
  );
}

export type MatchResult<T> = { kind: "match"; target: T } | { kind: "pending" } | { kind: "none" };

/**
 * Matches strokes against bindings, including multi-stroke sequences.
 * Feed it one stroke at a time; a prefix of a sequence returns
 * "pending" until the sequence completes or times out.
 */
export class Keymap<T> {
  private buffer: string[] = [];
  private last = 0;

  constructor(
    private bindings: Map<string, T>,
    private readonly timeoutMs = 1000,
  ) {}

  setBindings(bindings: Map<string, T>): void {
    this.bindings = bindings;
    this.buffer = [];
  }

  feed(stroke: string, now = Date.now()): MatchResult<T> {
    if (!stroke) return { kind: "none" };
    if (now - this.last > this.timeoutMs) this.buffer = [];
    this.last = now;
    this.buffer.push(stroke);

    for (;;) {
      const seq = this.buffer.join(" ");
      const exact = this.bindings.get(seq);
      if (exact !== undefined) {
        this.buffer = [];
        return { kind: "match", target: exact };
      }
      if ([...this.bindings.keys()].some((b) => b.startsWith(seq + " "))) return { kind: "pending" };
      // No binding continues this buffer: retry with the latest stroke alone.
      if (this.buffer.length === 1) {
        this.buffer = [];
        return { kind: "none" };
      }
      this.buffer = [stroke];
    }
  }
}
