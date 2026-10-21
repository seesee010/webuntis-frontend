import { afterEach, describe, expect, it, vi } from "vitest";
import type { Change } from "@/core/api/types";
import { addDays, today } from "@/core/dates";
import { Scope } from "@/core/reactive";
import { setupModules } from "@/core/bootstrap";
import { testContext } from "@/test/ctx";
import { snapshot } from "@/test/fixtures";
import subjects from "@/modules/subjects";
import notifications, { announce, setNotifier, wanted } from "./index";
import { describe as describeChange, inQuietHours } from "./describe";
import type { Notifier } from "./notifier";

function fakeNotifier(permitted = true): Notifier & { sent: [string, string][] } {
  const sent: [string, string][] = [];
  return { name: "web", sent, permitted: async () => permitted, request: async () => permitted, send: async (t, b) => void sent.push([t, b]) };
}

const tomorrow = addDays(today(), 1);
const changes: Change[] = [
  { kind: "cancelled", date: tomorrow, start: "08:00", subject: "MATH" },
  { kind: "room-change", date: tomorrow, start: "09:00", subject: "ENG", detail: "R101 → AULA" },
  { kind: "lesson-dropped", date: tomorrow, start: "10:00", subject: "GEO" },
  { kind: "substitution", date: addDays(today(), -3), start: "08:00", subject: "ART", detail: "HOL → IVE" },
];

afterEach(() => setNotifier(null));

describe("describe", () => {
  it("writes titles and bodies in the user's language", async () => {
    const ctx = await testContext(snapshot(), [notifications], { ui: { language: "de", clock: "24" } });
    const d = describeChange(ctx.i18n, changes[1]);
    expect(d.title).toBe("Raumänderung für ENG");
    expect(d.body).toContain("morgen");
    expect(d.body).toContain("09:00 · R101 → AULA");
  });

  it("knows quiet hours across midnight", () => {
    expect(inQuietHours("23:00", "22:00", "06:30")).toBe(true);
    expect(inQuietHours("05:00", "22:00", "06:30")).toBe(true);
    expect(inQuietHours("12:00", "22:00", "06:30")).toBe(false);
    expect(inQuietHours("13:00", "12:00", "14:00")).toBe(true);
    expect(inQuietHours("13:00", "", "")).toBe(false);
  });
});

describe("announce", () => {
  it("filters by kind and date, toasts, notifies and keeps a history", async () => {
    const n = fakeNotifier();
    setNotifier(n);
    const ctx = await testContext(snapshot(), [notifications, subjects], {
      notifications: { desktop: true }, subjects: { custom: { MATH: { name: "Maths" } } },
    });
    expect(wanted(ctx, changes, today()).map((c) => c.kind)).toEqual(["cancelled", "room-change"]);
    await announce(ctx, changes);
    expect(ctx.toasts.items.get().map((t) => t.title)).toEqual(["Maths is cancelled", "Room change for ENG"]);
    expect(n.sent.map(([t]) => t)).toEqual(["Maths is cancelled", "Room change for ENG"]);
    expect(ctx.settings.get<unknown[]>("state.notifications.history")).toHaveLength(2);
  });

  it("groups many changes and respects quiet hours and switches", async () => {
    const n = fakeNotifier();
    setNotifier(n);
    const ctx = await testContext(snapshot(), [notifications], {
      notifications: { desktop: true, maxSeparate: 1, quietFrom: "00:00", quietTo: "23:59", toasts: true },
    });
    await announce(ctx, changes, new Date(`${today()}T12:00:00`));
    expect(ctx.toasts.items.get().map((t) => t.title)).toEqual(["2 changes in your timetable"]);
    expect(n.sent).toEqual([]);
    ctx.settings.set("notifications.toasts", false);
    ctx.settings.set("notifications.kinds.cancelled", false);
    await announce(ctx, changes);
    expect(ctx.toasts.items.get()).toHaveLength(1);
  });

  it("does not send without permission", async () => {
    const n = fakeNotifier(false);
    setNotifier(n);
    const ctx = await testContext(snapshot(), [notifications], { notifications: { desktop: true } });
    await announce(ctx, changes);
    expect(n.sent).toEqual([]);
  });

  it("listens to change events from the backend", async () => {
    const ctx = await testContext(snapshot(), [notifications]);
    const off = setupModules(ctx);
    ctx.bus.emit("changes", [changes[0]]);
    await vi.waitFor(() => expect(ctx.toasts.items.get()).toHaveLength(1));
    off();
  });
});

describe("settings UI", () => {
  it("sends a test notification and shows the history widget", async () => {
    const n = fakeNotifier();
    setNotifier(n);
    const ctx = await testContext(snapshot(), [notifications]);
    const test = notifications.settings![0].fields.find((f) => f.type === "custom")!;
    if (test.type !== "custom") throw new Error();
    const el = test.render(ctx, new Scope());
    el.querySelector("button")!.click();
    await vi.waitFor(() => expect(n.sent).toHaveLength(1));
    expect(el.textContent).toContain("Sent.");

    await ctx.data.loadOverview();
    const widget = notifications.widgets![0].render(ctx, new Scope());
    expect(widget.textContent).toContain("No changes noticed yet.");
    await announce(ctx, [changes[0]]);
    expect(widget.textContent).toContain("MATH is cancelled");
  });

  it("reports unsupported platforms", async () => {
    setNotifier({ ...fakeNotifier(), name: "none" });
    const ctx = await testContext(snapshot(), [notifications]);
    const test = notifications.settings![0].fields.find((f) => f.type === "custom")!;
    if (test.type !== "custom") throw new Error();
    const el = test.render(ctx, new Scope());
    el.querySelector("button")!.click();
    await vi.waitFor(() => expect(el.textContent).toContain("not supported"));
  });
});
