import { describe, expect, it, vi } from "vitest";
import { Toasts } from "./toasts";

describe("Toasts", () => {
  it("shows, auto-dismisses and keeps sticky toasts", () => {
    vi.useFakeTimers();
    const t = new Toasts();
    t.show("info", "short", undefined, 1000);
    const sticky = t.show("error", "sticky", "body", 0);
    vi.advanceTimersByTime(1500);
    expect(t.items.get().map((x) => x.title)).toEqual(["sticky"]);
    t.dismiss(sticky);
    expect(t.items.get()).toHaveLength(0);
    vi.useRealTimers();
  });
});
