import type { AppContext } from "./app";
import type { IconName } from "./icons";
import type { Scope } from "./reactive";

/** Renders a view into a fresh element. Everything the view subscribes
 * to must be registered on the scope; it is disposed on navigation. */
export type RenderView = (ctx: AppContext, scope: Scope, params: URLSearchParams) => HTMLElement;

export interface RouteDef {
  path: string;
  render: RenderView;
  /** Shown in the sidebar (default true). */
  nav?: boolean;
}

/**
 * A feature of the app. Everything a feature contributes is declared
 * here, so adding a feature is: create a folder under modules/, export a
 * ModuleDef, and list it in modules/index.ts.
 *
 * Later subsystems extend this interface through declaration merging
 * (settings schemas, dashboard widgets, commands, ...).
 */
export interface ModuleDef {
  id: string;
  /** i18n key or plain text. */
  title: string;
  icon: IconName;
  /** Sort order in navigation; lower comes first. */
  order?: number;
  route?: RouteDef;
  /** Called once at start-up; may return a cleanup. */
  setup?(ctx: AppContext): void | (() => void);
}

/** Identity helper that gives modules full type inference. */
export function defineModule(def: ModuleDef): ModuleDef {
  return def;
}

export class ModuleRegistry {
  private readonly mods: ModuleDef[] = [];

  register(...defs: ModuleDef[]): void {
    for (const d of defs) {
      if (this.mods.some((m) => m.id === d.id)) throw new Error(`module "${d.id}" registered twice`);
      this.mods.push(d);
    }
    this.mods.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  }

  all(): readonly ModuleDef[] {
    return this.mods;
  }

  get(id: string): ModuleDef | undefined {
    return this.mods.find((m) => m.id === id);
  }

  routeFor(path: string): ModuleDef | undefined {
    return this.mods.find((m) => m.route?.path === path);
  }
}
