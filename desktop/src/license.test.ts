// The project is GPL-2.0; LICENSE and every manifest must agree.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("license", () => {
  it("ships the GPL-2.0 text", () => {
    const text = readFileSync("../LICENSE", "utf8");
    expect(text).toContain("GNU GENERAL PUBLIC LICENSE");
    expect(text).toContain("Version 2, June 1991");
  });

  it("is declared in the manifests and the README", () => {
    expect(JSON.parse(readFileSync("package.json", "utf8")).license).toBe("GPL-2.0-only");
    expect(readFileSync("src-tauri/Cargo.toml", "utf8")).toMatch(/^license = "GPL-2\.0-only"$/m);
    expect(readFileSync("../README.md", "utf8")).toContain("[GNU General Public License v2.0](LICENSE)");
  });
});
