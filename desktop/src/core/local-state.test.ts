import { describe, expect, it } from "vitest";
import { IdSet } from "./local-state";
import { testContext } from "@/test/ctx";
import { snapshot } from "@/test/fixtures";

describe("IdSet", () => {
  it("stores marks in the settings document", async () => {
    const ctx = await testContext(snapshot(), []);
    const done = new IdSet(ctx.settings, "state.test.done");
    done.toggle("a");
    done.set("b", true);
    done.set("b", true);
    expect(ctx.settings.get("state.test.done")).toEqual(["a", "b"]);
    done.toggle("a");
    expect(done.has("a")).toBe(false);
    done.prune(["x"]);
    expect(ctx.settings.get("state.test.done")).toEqual([]);
  });
});
