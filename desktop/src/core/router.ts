import { Signal, type ReadSignal } from "./reactive";

export interface Route {
  path: string; // e.g. "/timetable"
  params: URLSearchParams;
}

function parse(hash: string): Route {
  const raw = hash.replace(/^#/, "") || "/";
  const [path, query = ""] = raw.split("?", 2);
  return { path: path.startsWith("/") ? path : `/${path}`, params: new URLSearchParams(query) };
}

/** Hash based router: #/timetable?week=2026-10-19 */
export class Router {
  private readonly current = new Signal<Route>(parse(location.hash), (a, b) =>
    a.path === b.path && a.params.toString() === b.params.toString(),
  );

  constructor() {
    window.addEventListener("hashchange", () => this.current.set(parse(location.hash)));
  }

  get route(): ReadSignal<Route> {
    return this.current;
  }

  navigate(path: string, params?: Record<string, string> | URLSearchParams): void {
    const q = params ? new URLSearchParams(params).toString() : "";
    location.hash = q ? `${path}?${q}` : path;
  }

  /** Changes query parameters of the current route without a history entry. */
  setParams(params: Record<string, string | null>): void {
    const { path, params: cur } = this.current.get();
    const next = new URLSearchParams(cur);
    for (const [k, v] of Object.entries(params)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    const q = next.toString();
    history.replaceState(null, "", `#${path}${q ? `?${q}` : ""}`);
    this.current.set({ path, params: next });
  }
}
