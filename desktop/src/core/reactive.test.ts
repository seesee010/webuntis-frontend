import { describe, expect, it, vi } from "vitest";
import { Scope, Signal, computed } from "./reactive";
import { Bus } from "./bus";

describe("Signal", () => {
  it("notifies subscribers on change only", () => {
    const s = new Signal(1);
    const fn = vi.fn();
    s.subscribe(fn);
    s.set(1);
    s.set(2);
    expect(fn.mock.calls).toEqual([[1], [2]]);
  });

  it("computed follows its dependencies", () => {
    const a = new Signal(2);
    const b = new Signal(3);
    const sum = computed([a, b], () => a.get() + b.get());
    a.set(10);
    expect(sum.get()).toBe(13);
  });
});

describe("Scope", () => {
  it("disposes subscriptions, children and late additions", () => {
    const s = new Signal(0);
    const fn = vi.fn();
    const scope = new Scope();
    scope.child().watch(s, fn, false);
    scope.dispose();
    s.set(1);
    expect(fn).not.toHaveBeenCalled();
    const late = vi.fn();
    scope.add(late);
    expect(late).toHaveBeenCalledOnce();
  });
});

describe("Bus", () => {
  it("isolates failing handlers", () => {
    const bus = new Bus<{ ping: number }>();
    const ok = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    bus.on("ping", () => {
      throw new Error("boom");
    });
    const off = bus.on("ping", ok);
    bus.emit("ping", 1);
    off();
    bus.emit("ping", 2);
    expect(ok.mock.calls).toEqual([[1]]);
  });
});
