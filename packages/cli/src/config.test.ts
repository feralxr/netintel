import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// config.ts computes its config file path from os.homedir() at call time
// (not module-load time), so mocking homedir() here — rather than letting
// it fall through to the real one — is what keeps this test from ever
// touching the actual developer/CI-runner's ~/.netintel directory.
const FAKE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "netintel-cli-test-home-"));
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof os>();
  return { ...actual, homedir: () => FAKE_HOME, default: { ...actual, homedir: () => FAKE_HOME } };
});

const { loadConfig, saveConfig, isChartStyle, resolveChartStyle, isJsonMode, CHART_STYLES } = await import("./config.js");

afterAll(() => {
  fs.rmSync(FAKE_HOME, { recursive: true, force: true });
});

beforeEach(() => {
  // Reset argv to a clean baseline and wipe any persisted config between tests.
  process.argv = ["node", "netintel"];
  fs.rmSync(path.join(FAKE_HOME, ".netintel"), { recursive: true, force: true });
});

describe("isChartStyle", () => {
  it("accepts every declared style", () => {
    for (const style of CHART_STYLES) expect(isChartStyle(style)).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isChartStyle("bogus")).toBe(false);
    expect(isChartStyle("")).toBe(false);
  });
});

describe("loadConfig / saveConfig", () => {
  it("defaults to line style when nothing has been saved yet", () => {
    expect(loadConfig().chartStyle).toBe("line");
  });
  it("persists and reloads a saved style", () => {
    saveConfig({ chartStyle: "braille" });
    expect(loadConfig().chartStyle).toBe("braille");
  });
  it("writes to the mocked home directory, not the real one", () => {
    saveConfig({ chartStyle: "sparkline" });
    expect(fs.existsSync(path.join(FAKE_HOME, ".netintel", "cli-config.json"))).toBe(true);
  });
});

describe("resolveChartStyle", () => {
  it("falls back to the persisted config when no --chart flag is present", () => {
    saveConfig({ chartStyle: "sparkline" });
    expect(resolveChartStyle()).toBe("sparkline");
  });
  it("defaults to line when nothing is persisted and no flag is given", () => {
    expect(resolveChartStyle()).toBe("line");
  });
  it("--chart flag overrides the persisted config", () => {
    saveConfig({ chartStyle: "sparkline" });
    process.argv = ["node", "netintel", "system", "--chart", "braille"];
    expect(resolveChartStyle()).toBe("braille");
  });
  it("ignores an invalid --chart flag value and falls back to persisted config", () => {
    saveConfig({ chartStyle: "sparkline" });
    process.argv = ["node", "netintel", "system", "--chart", "not-a-real-style"];
    expect(resolveChartStyle()).toBe("sparkline");
  });
});

describe("isJsonMode", () => {
  it("is false by default", () => {
    expect(isJsonMode()).toBe(false);
  });
  it("is true when --json is anywhere in argv", () => {
    process.argv = ["node", "netintel", "status", "--json"];
    expect(isJsonMode()).toBe(true);
  });
});
