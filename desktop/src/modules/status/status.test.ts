import { describe, expect, it, vi } from "vitest";
import type { UpdateStatus } from "@/core/api/types";
import { Scope } from "@/core/reactive";
import { settle, testContext } from "@/test/ctx";
import { snapshot } from "@/test/fixtures";
import status from "./index";

const update = (over: Partial<UpdateStatus> = {}): UpdateStatus => ({
  current: "1.0.0", supported: true, enabled: true, state: "idle", kind: "deb", checkedAt: null, ...over,
});

async function render(st: UpdateStatus | null) {
  const ctx = await testContext(snapshot(), [status]);
  (ctx.api.update as ReturnType<typeof vi.fn>).mockResolvedValue(st);
  const el = status.route!.render(ctx, new Scope(), new URLSearchParams());
  await settle();
  const row = (label: string) => [...el.querySelectorAll(".kv")].find((r) => r.firstElementChild!.textContent === label);
  return { ctx, el, row };
}

describe("status page: updates", () => {
  it("has no update rows without an updater", async () => {
    const { row } = await render(null);
    expect(row("Updates")).toBeUndefined();
    expect(row("Last update check")).toBeUndefined();
  });

  it("describes every state", async () => {
    const cases: [UpdateStatus, string][] = [
      [update(), "Not checked yet"],
      [update({ enabled: false }), "Automatic checks are off"],
      [update({ checkedAt: "2026-11-13T08:00:00Z" }), "Up to date"],
      [update({ checkedAt: "2026-11-13T08:00:00Z", checkError: "rate limited" }), "Not checked yet"],
      [update({ state: "available", latest: "1.1.0" }), "Version 1.1.0 is available"],
      [update({ state: "failed", latest: "1.1.0", error: "x" }), "Version 1.1.0 is available"],
      [update({ state: "downloading", latest: "1.1.0" }), "Downloading version 1.1.0"],
      [update({ state: "done", latest: "1.1.0" }), "Version 1.1.0 is ready"],
    ];
    for (const [st, text] of cases) {
      const { row } = await render(st);
      expect(row("Updates")!.lastElementChild!.textContent, JSON.stringify(st)).toContain(text);
    }
  });

  it("shows when it last looked and why that failed", async () => {
    const { row } = await render(update({ checkedAt: "2026-11-13T08:00:00Z", checkError: "release source answered 403 Forbidden" }));
    expect(row("Last update check")!.lastElementChild!.textContent).toContain("403 Forbidden");
    const never = await render(update());
    expect(never.row("Last update check")!.lastElementChild!.textContent).toBe("–");
  });

  it("offers no check for development builds", async () => {
    const { row } = await render(update({ supported: false, current: "dev" }));
    expect(row("Updates")!.textContent).toContain("Not available for this build");
    expect(row("Updates")!.querySelector("button")).toBeNull();
    expect(row("Last update check")).toBeUndefined();
  });

  it("checks on request and reports the result", async () => {
    const { ctx, row } = await render(update());
    expect(ctx.api.checkUpdate).not.toHaveBeenCalled();
    (ctx.api.checkUpdate as ReturnType<typeof vi.fn>).mockResolvedValue(update({ checkedAt: "2026-11-13T08:00:00Z" }));
    row("Updates")!.querySelector("button")!.click();
    await settle();
    expect(ctx.api.checkUpdate).toHaveBeenCalledTimes(1);
    expect(ctx.toasts.items.get().map((t) => t.title)).toEqual(["Up to date"]);
    expect(row("Updates")).toBeDefined();

    (ctx.api.checkUpdate as ReturnType<typeof vi.fn>).mockResolvedValue(update({ checkedAt: "2026-11-13T08:01:00Z", checkError: "offline" }));
    ctx.toasts.items.get().forEach((t) => ctx.toasts.dismiss(t.id));
    row("Updates")!.querySelector("button")!.click(); // the row was rendered again, the button is the same
    await settle();
    expect(ctx.toasts.items.get().map((t) => t.title)).toEqual(["Could not check for updates"]);
  });

  it("follows update events while it is open", async () => {
    const { ctx, row } = await render(update());
    ctx.bus.emit("update", update({ state: "available", latest: "2.0.0" }));
    expect(row("Updates")!.textContent).toContain("Version 2.0.0 is available");
  });
});
