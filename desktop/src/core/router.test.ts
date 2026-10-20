import { beforeEach, describe, expect, it } from "vitest";
import { Router } from "./router";

beforeEach(() => history.replaceState(null, "", "#/"));

describe("Router", () => {
  it("parses path and query from the hash", () => {
    history.replaceState(null, "", "#/timetable?date=2026-10-05");
    const r = new Router();
    expect(r.route.get().path).toBe("/timetable");
    expect(r.route.get().params.get("date")).toBe("2026-10-05");
  });

  it("updates params without navigating", () => {
    history.replaceState(null, "", "#/timetable?mode=day");
    const r = new Router();
    r.setParams({ date: "2026-10-06", mode: null });
    expect(location.hash).toBe("#/timetable?date=2026-10-06");
    expect(r.route.get().params.has("mode")).toBe(false);
  });

  it("navigates via the hash", async () => {
    const r = new Router();
    r.navigate("/exams", { past: "1" });
    await new Promise((res) => window.addEventListener("hashchange", res, { once: true }));
    expect(r.route.get()).toMatchObject({ path: "/exams" });
    expect(r.route.get().params.get("past")).toBe("1");
  });
});
