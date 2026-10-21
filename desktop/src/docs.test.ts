// Keeps the README and the architecture docs in sync with the code.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { modules } from "@/modules";

const readme = readFileSync("../README.md", "utf8");
const architecture = readFileSync("../docs/architecture.md", "utf8");

describe("README", () => {
  it("keeps the badge and the AI disclosure", () => {
    expect(readme).toContain("![Made With:Agentic_Engineering](https://img.shields.io/badge/made%20with-Agentic_Engineering-red?style=plastic)");
    expect(readme).toMatch(/every issue and pull request[\s\S]*seesee010[\s\S]*fully AI generated/);
  });

  it("states the real number of settings and sections", () => {
    const sections = modules.flatMap((m) => m.settings ?? []);
    const fields = sections.flatMap((s) => s.fields);
    expect(readme).toContain(`${fields.length} settings in ${sections.length} sections`);
  });

  it("lists every page shortcut", () => {
    for (const m of modules) if (m.route?.key) expect(readme, m.id).toContain(`\`${m.route.key}\``);
  });
});

describe("architecture.md", () => {
  it("describes every module", () => {
    for (const m of modules) expect(architecture, m.id).toContain(`\`${m.id}\``);
  });

  it("lists every settings field type", () => {
    for (const t of ["toggle", "number", "range", "select", "segmented", "color", "text", "list", "keybinding", "custom"]) {
      expect(architecture).toContain(`\`${t}\``);
    }
  });
});
