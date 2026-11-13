import type { ApiClient } from "./api/client";
import type { UpdateStatus } from "./api/types";
import type { AppEvents } from "./app";
import type { Bus } from "./bus";
import { Signal, type ReadSignal } from "./reactive";

/**
 * The frontend's side of the updater. The backend looks for newer
 * releases and does the work; this holds its state for the update button
 * and the status page, and passes on what the user asks for.
 */
export class UpdateService {
  private readonly sig = new Signal<UpdateStatus | null>(null);

  constructor(
    private readonly api: ApiClient,
    bus: Bus<AppEvents>,
  ) {
    bus.on("update", (st) => this.sig.set(st));
  }

  /** Null until the first answer, and with a backend that has no updater. */
  get status(): ReadSignal<UpdateStatus | null> {
    return this.sig;
  }

  /** Reads the current state. Failing is fine: then there is no button. */
  async load(): Promise<void> {
    try {
      this.sig.set(await this.api.update());
    } catch {
      /* no updater in this backend, or it is not reachable */
    }
  }

  /** Looks for a newer release now ("Check now"). */
  async check(): Promise<UpdateStatus> {
    const st = await this.api.checkUpdate();
    this.sig.set(st);
    return st;
  }

  /** The update button. */
  async apply(): Promise<UpdateStatus> {
    const st = await this.api.applyUpdate();
    this.sig.set(st);
    return st;
  }

  openPage(): Promise<UpdateStatus> {
    return this.api.openUpdatePage();
  }

  /**
   * Restarts into the installed version: the desktop shell restarts the
   * whole app; the web edition restarts untisd, and the page reloads once
   * the new version answers.
   */
  async restart(): Promise<void> {
    const st = this.sig.get();
    const how = st?.state === "done" ? st.result?.restart : undefined;
    if (how === "app") {
      if (!("__TAURI_INTERNALS__" in window)) throw new Error("only the desktop app can restart itself");
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("restart_app");
      return;
    }
    if (how !== "server") throw new Error("there is no installed update to restart into");
    await this.api.restartBackend();
    await this.untilVersionChanges(st!.current);
    location.reload();
  }

  private async untilVersionChanges(old: string, tries = 100, pauseMs = 300): Promise<void> {
    for (let i = 0; i < tries; i++) {
      await new Promise((r) => setTimeout(r, pauseMs));
      try {
        if ((await this.api.health()).version !== old) return;
      } catch {
        /* between the old and the new process */
      }
    }
    throw new Error("the new version did not start; start untisd again");
  }
}
