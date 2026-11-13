import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdateStatus } from "@/core/api/types";
import type { AppContext } from "@/core/app";
import { defineModule } from "@/core/module";
import { settle, testContext } from "@/test/ctx";
import { snapshot } from "@/test/fixtures";
import { mountShell } from "./shell";

HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event("close")); };

const status = (over: Partial<UpdateStatus> = {}): UpdateStatus => ({
  current: "1.0.0", supported: true, enabled: true, state: "idle", kind: "appimage", checkedAt: "2026-11-13T08:00:00Z", ...over,
});
const available = (over: Partial<UpdateStatus> = {}) =>
  status({ state: "available", latest: "1.1.0", action: "replace", asset: "Untis_1.1.0_amd64.AppImage", size: 200, url: "https://example.org/v1.1.0", ...over });

const page = defineModule({ id: "b", title: "B", icon: "info", route: { path: "/b", render: () => document.createElement("div") } });

async function mount(settings: Record<string, unknown> = {}): Promise<{ ctx: AppContext; root: HTMLElement; btn: HTMLButtonElement; push: (st: UpdateStatus) => void }> {
  const ctx = await testContext(snapshot(), [page], settings);
  const root = document.createElement("div");
  document.body.append(root);
  mountShell(root, ctx);
  const btn = root.querySelector<HTMLButtonElement>(".update-btn")!;
  return { ctx, root, btn, push: (st) => ctx.bus.emit("update", st) };
}

const dialogs = () => [...document.querySelectorAll("dialog")];

beforeEach(() => {
  history.replaceState(null, "", "#/b");
  document.body.replaceChildren();
});

describe("update button", () => {
  it("is not shown while nothing is known or the app is up to date", async () => {
    const { btn, push } = await mount();
    expect(btn).not.toBeNull();
    expect(btn.hidden).toBe(true);
    push(status());
    expect(btn.hidden).toBe(true);
    push(status({ checkError: "rate limited" }));
    expect(btn.hidden).toBe(true);
    push(status({ supported: false, current: "dev" }));
    expect(btn.hidden).toBe(true);
  });

  it("appears with the new version when a release is found, and goes again", async () => {
    const { ctx, btn, push } = await mount();
    push(available());
    expect(btn.hidden).toBe(false);
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe("Update to 1.1.0");
    // finding it downloads nothing
    expect(ctx.api.applyUpdate).not.toHaveBeenCalled();
    push(status());
    expect(btn.hidden).toBe(true);
  });

  it("starts the update only on a click", async () => {
    const { ctx, btn, push } = await mount();
    push(available());
    await settle();
    expect(ctx.api.applyUpdate).not.toHaveBeenCalled();
    (ctx.api.applyUpdate as ReturnType<typeof vi.fn>).mockResolvedValue(available({ state: "downloading", done: 0 }));
    btn.click();
    await settle();
    expect(ctx.api.applyUpdate).toHaveBeenCalledTimes(1);
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe("Downloading… 0%");
    // a second click while it runs does nothing
    btn.click();
    await settle();
    expect(ctx.api.applyUpdate).toHaveBeenCalledTimes(1);
  });

  it("shows the progress", async () => {
    const { btn, push } = await mount();
    push(available({ state: "downloading", done: 50 }));
    expect(btn.textContent).toBe("Downloading… 25%");
    push(available({ state: "downloading", done: 199 }));
    expect(btn.textContent).toBe("Downloading… 99%");
    push(available({ state: "downloading", done: 500 }));
    expect(btn.textContent).toBe("Downloading… 100%");
    push(available({ state: "downloading", size: 0, done: 5 }));
    expect(btn.textContent).toBe("Downloading… 0%");
  });

  it("offers the restart when the new version is in place", async () => {
    const { ctx, btn, push } = await mount();
    (ctx.api.applyUpdate as ReturnType<typeof vi.fn>).mockResolvedValue(available({ state: "downloading" }));
    push(available());
    btn.click();
    await settle();
    push(available({ state: "done", done: 200, result: { action: "replace", restart: "app" } }));
    expect(btn.hidden).toBe(false);
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe("Restart to update");
    // the window that started it explains what is next
    const [dlg] = dialogs();
    expect(dlg.textContent).toContain("Version 1.1.0 is installed. Restart the app to use it.");
    expect([...dlg.querySelectorAll(".dialog-actions .btn")].map((b) => b.textContent)).toEqual(["Later", "Restart now"]);
    // "Later" keeps the button, which opens the dialog again
    (dlg.querySelector(".dialog-actions .btn") as HTMLButtonElement).click();
    expect(dialogs()).toHaveLength(0);
    btn.click();
    expect(dialogs()).toHaveLength(1);
  });

  it("restarts through the update service", async () => {
    const { ctx, btn, push } = await mount();
    const restart = vi.spyOn(ctx.update, "restart").mockResolvedValue();
    push(available({ state: "done", result: { action: "replace", restart: "server" }, kind: "web" }));
    btn.click();
    const go = [...dialogs()[0].querySelectorAll<HTMLButtonElement>(".dialog-actions .btn")].find((b) => b.textContent === "Restart now")!;
    go.click();
    await settle();
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it("reports a restart that did not work and lets the user try again", async () => {
    const { ctx, btn, push } = await mount();
    vi.spyOn(ctx.update, "restart").mockRejectedValue(new Error("the new version did not start"));
    push(available({ state: "done", result: { action: "replace", restart: "server" }, kind: "web" }));
    btn.click();
    const go = [...dialogs()[0].querySelectorAll<HTMLButtonElement>(".dialog-actions .btn")].find((b) => b.textContent === "Restart now")!;
    go.click();
    await settle();
    expect(go.disabled).toBe(false);
    expect(ctx.toasts.items.get().map((x) => x.body)).toContain("the new version did not start");
  });

  it("tells the user to start the web edition again where it cannot restart itself", async () => {
    const { btn, push } = await mount();
    push(available({ state: "done", kind: "web", result: { action: "replace", restart: "manual" } }));
    expect(btn.textContent).toBe("Finish the update");
    btn.click();
    const [dlg] = dialogs();
    expect(dlg.textContent).toContain("Close untisd and start it again");
    expect(dlg.textContent).not.toContain("Restart now");
  });

  it("shows the command for a downloaded package", async () => {
    const { btn, push } = await mount();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const command = "sudo apt install '/home/u/Downloads/Untis_1.1.0_amd64.deb'";
    push(available({ state: "done", kind: "deb", action: "save", result: { action: "save", file: "/home/u/Downloads/Untis_1.1.0_amd64.deb", command } }));
    expect(btn.textContent).toBe("Finish the update");
    btn.click();
    const [dlg] = dialogs();
    expect(dlg.querySelector(".update-command")!.textContent).toBe(command);
    expect(dlg.textContent).toContain("/home/u/Downloads/Untis_1.1.0_amd64.deb");
    const copy = [...dlg.querySelectorAll<HTMLButtonElement>(".dialog-actions .btn")].find((b) => b.textContent === "Copy the command")!;
    copy.click();
    await settle();
    expect(writeText).toHaveBeenCalledWith(command);
    expect(copy.textContent).toBe("Copied");
  });

  it("says that the installer was opened", async () => {
    const { btn, push } = await mount();
    push(available({ state: "done", kind: "nsis", action: "run", result: { action: "run", file: "C:\\Users\\u\\Downloads\\Untis_1.1.0_x64-setup.exe" } }));
    btn.click();
    expect(dialogs()[0].textContent).toContain("The installer of version 1.1.0 was downloaded and opened.");
    expect(dialogs()[0].textContent).toContain("Untis_1.1.0_x64-setup.exe");
  });

  it("keeps the button after a failure and offers a retry and the release page", async () => {
    const { ctx, btn, push } = await mount();
    (ctx.api.applyUpdate as ReturnType<typeof vi.fn>).mockResolvedValue(available({ state: "downloading" }));
    push(available());
    btn.click();
    await settle();
    push(available({ state: "failed", error: "Untis_1.1.0_amd64.AppImage does not match its checksum" }));
    expect(btn.hidden).toBe(false);
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe("Update to 1.1.0");
    const [dlg] = dialogs();
    expect(dlg.textContent).toContain("The update failed");
    expect(dlg.textContent).toContain("does not match its checksum");
    expect(dlg.textContent).toContain("Your current version is unchanged.");

    const [pageBtn, retry] = dlg.querySelectorAll<HTMLButtonElement>(".dialog-actions .btn");
    expect(pageBtn.textContent).toBe("Open the release page");
    retry.click();
    await settle();
    expect(ctx.api.applyUpdate).toHaveBeenCalledTimes(2);
    expect(dialogs()).toHaveLength(0);

    // the button itself retries as well
    push(available({ state: "failed", error: "again" }));
    btn.click();
    await settle();
    expect(ctx.api.applyUpdate).toHaveBeenCalledTimes(3);
  });

  it("opens the release page from the failure dialog", async () => {
    const { ctx, btn, push } = await mount();
    (ctx.api.applyUpdate as ReturnType<typeof vi.fn>).mockResolvedValue(available({ state: "downloading" }));
    push(available());
    btn.click();
    await settle();
    push(available({ state: "failed", error: "no write access" }));
    (dialogs()[0].querySelector(".dialog-actions .btn") as HTMLButtonElement).click();
    await settle();
    expect(ctx.api.openUpdatePage).toHaveBeenCalledTimes(1);
  });

  it("opens the release page where no file fits the installation", async () => {
    const { ctx, btn, push } = await mount();
    const st = available({ kind: "unknown", action: "page", asset: undefined, size: undefined });
    (ctx.api.applyUpdate as ReturnType<typeof vi.fn>).mockResolvedValue(st);
    push(st);
    expect(btn.title).toBe("Opens the release page in your browser.");
    btn.click();
    await settle();
    expect(ctx.api.applyUpdate).toHaveBeenCalledTimes(1);
    expect(ctx.toasts.items.get().map((x) => x.title)).toEqual(["Release page opened"]);
    // the address is in the message, for machines where no browser opened
    expect(ctx.toasts.items.get()[0].body).toContain("https://example.org/v1.1.0");
    // still pending: the button stays
    expect(btn.hidden).toBe(false);
    expect(dialogs()).toHaveLength(0);
  });

  it("says in the tooltip what the button will do", async () => {
    const { btn, push } = await mount();
    push(available());
    expect(btn.title).toContain("installs it");
    push(available({ kind: "nsis", action: "run" }));
    expect(btn.title).toContain("installer");
    push(available({ kind: "rpm", action: "save" }));
    expect(btn.title).toContain("package manager");
  });

  it("does not pop up in a window that did not start the update", async () => {
    const { btn, push } = await mount();
    push(available({ state: "downloading", done: 10 })); // started elsewhere
    push(available({ state: "done", result: { action: "replace", restart: "app" } }));
    expect(dialogs()).toHaveLength(0);
    expect(btn.textContent).toBe("Restart to update");
  });

  it("reports a click that the backend refuses", async () => {
    const { ctx, btn, push } = await mount();
    (ctx.api.applyUpdate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("no update is available"));
    push(available());
    btn.click();
    await settle();
    expect(ctx.toasts.items.get().map((x) => x.title)).toEqual(["The update could not be started"]);
    expect(btn.hidden).toBe(false);
  });

  it("is translated", async () => {
    const { btn, push } = await mount({ ui: { language: "de" } });
    push(available());
    expect(btn.textContent).toBe("Update auf 1.1.0");
    push(available({ state: "downloading", done: 100 }));
    expect(btn.textContent).toBe("Lädt… 50 %");
  });
});
