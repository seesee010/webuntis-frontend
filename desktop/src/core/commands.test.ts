import { describe, expect, it } from "vitest";
import { allCommands, bindingKey, fuzzyScore } from "./commands";
import { defineModule } from "./module";
import { testContext } from "@/test/ctx";
import { snapshot } from "@/test/fixtures";

describe("allCommands", () => {
  it("adds a navigation command per page and the modules' commands", async () => {
    const page = defineModule({ id: "exams", title: "Exams", icon: "exam", route: { path: "/exams", key: "g e", render: () => document.createElement("div") } });
    const hidden = defineModule({ id: "x", title: "X", icon: "info", route: { path: "/x", nav: false, render: () => document.createElement("div") } });
    const withCmd = defineModule({ id: "y", title: "Y", icon: "info", commands: [{ id: "y.run", title: "Run Y", run: () => {} }] });
    const ctx = await testContext(snapshot(), [page, hidden, withCmd]);
    const cmds = allCommands(ctx);
    expect(cmds.map((c) => c.id)).toEqual(["go.exams", "y.run"]);
    expect(cmds[0].title).toBe("Go to Exams");
    expect(cmds[0].key).toBe("g e");
  });

  it("derives settings keys from command ids", () => {
    expect(bindingKey("go.exams")).toBe("keys.go_exams");
  });
});

describe("fuzzyScore", () => {
  it("requires all characters in order and prefers word starts", () => {
    expect(fuzzyScore("gtt", "Go to Timetable")).toBeGreaterThan(0);
    expect(fuzzyScore("xyz", "Go to Timetable")).toBe(-1);
    expect(fuzzyScore("time", "Go to Timetable")).toBeGreaterThan(fuzzyScore("time", "Toggle remote item mode"));
    expect(fuzzyScore("", "anything")).toBe(0);
  });
});
