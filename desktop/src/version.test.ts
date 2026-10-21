// All version numbers must agree with the VERSION file.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");
const version = read("../VERSION").trim();

describe("version", () => {
  it("is semantic", () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("matches package.json, tauri.conf.json and Cargo.toml", () => {
    expect(JSON.parse(read("package.json")).version).toBe(version);
    expect(JSON.parse(read("src-tauri/tauri.conf.json")).version).toBe(version);
    expect(read("src-tauri/Cargo.toml")).toMatch(new RegExp(`^version = "${version.replace(/\./g, "\\.")}"`, "m"));
  });

  it("has a changelog entry", () => {
    expect(read("../CHANGELOG.md")).toContain(`## [${version}]`);
  });
});
