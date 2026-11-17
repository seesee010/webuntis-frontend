import { describe, expect, it } from "vitest";
import { planImport, preview, shareable } from "./transfer";

const mine = {
  ui: { theme: { accent: "#123456" } },
  backend: {
    provider: "cli",
    cli: { binary: "/home/anna/bin/untis", extraArgs: ["--profile", "anna"], configPath: "/home/anna/.config/untis/config.json", envPath: "/home/anna/.env", timeoutSec: 60 },
  },
  state: { notifications: { history: [{ title: "MATH is cancelled" }] }, homework: { done: [{ id: "1", date: "2026-11-17" }] } },
};

describe("export", () => {
  it("leaves out local data and this machine's CLI paths and arguments", () => {
    const out = shareable(mine);
    expect(out).toEqual({ ui: { theme: { accent: "#123456" } }, backend: { provider: "cli", cli: { timeoutSec: 60 } } });
    expect(JSON.stringify(out)).not.toContain("anna");
    expect(mine.state.homework.done).toHaveLength(1); // the input is not changed
  });
});

describe("import", () => {
  it("takes a shared theme without touching local data or the CLI setup", () => {
    const theme = { ui: { theme: { accent: "#ff0000", mode: "dark" } } };
    const plan = planImport(mine, theme);
    expect(plan.risky).toEqual([]);
    const doc = plan.result(false);
    expect(doc.ui).toEqual(theme.ui);
    expect(doc.state).toEqual(mine.state); // history and marks stay
    // this machine's CLI setup stays; everything else is replaced, as before
    const { binary, extraArgs, configPath, envPath } = mine.backend.cli;
    expect(doc.backend).toEqual({ cli: { binary, extraArgs, configPath, envPath } });
  });

  it("asks before a file changes the program, its arguments or the files it reads", () => {
    const evil = {
      backend: { provider: "cli", cli: { binary: "/tmp/evil.sh", extraArgs: ["--config", "/tmp/x"], configPath: "/home/anna/.config/untis/config.json", timeoutSec: 30 } },
      state: { homework: { done: [] } },
    };
    const plan = planImport(mine, evil);
    // configPath is the same as now, so it is not asked about; envPath is missing, so it stays
    expect(plan.risky).toEqual([
      { key: "backend.cli.binary", value: "/tmp/evil.sh" },
      { key: "backend.cli.extraArgs", value: ["--config", "/tmp/x"] },
    ]);

    const refused = plan.result(false);
    expect(refused.backend).toEqual({
      provider: "cli",
      cli: { binary: "/home/anna/bin/untis", extraArgs: ["--profile", "anna"], configPath: "/home/anna/.config/untis/config.json", envPath: "/home/anna/.env", timeoutSec: 30 },
    });
    expect(refused.state).toEqual(mine.state); // the file's empty marks are ignored

    const accepted = plan.result(true);
    expect((accepted.backend as typeof mine.backend).cli.binary).toBe("/tmp/evil.sh");
    expect((accepted.backend as typeof mine.backend).cli.extraArgs).toEqual(["--config", "/tmp/x"]);
  });

  it("asks before a file brings its own stylesheet", () => {
    const plan = planImport({}, { ui: { theme: { customCss: "body { background: url(https://example.invalid/t.png) }" } } });
    expect(plan.risky.map((r) => r.key)).toEqual(["ui.theme.customCss"]);
    expect(plan.result(false)).toEqual({ ui: { theme: {} } });
    expect(planImport({}, { ui: { theme: { customCss: "  " } } }).risky).toEqual([]); // empty: nothing to ask
  });

  it("removes a machine setting the user does not have when the change is refused", () => {
    const plan = planImport({ ui: {} }, { backend: { cli: { binary: "/tmp/evil.sh" } } });
    expect(plan.result(false)).toEqual({ backend: { cli: {} } });
  });

  it("previews long values", () => {
    expect(preview("x".repeat(200), 10)).toBe("xxxxxxxxxx…");
    expect(preview(["--long"])).toBe('["--long"]');
  });
});
