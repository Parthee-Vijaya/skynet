import { describe, expect, it } from "vitest";

import { getSkynetToolLeafName, isSkynetToolName } from "./tool-name-normalization.js";

describe("isSkynetToolName", () => {
  it("detects Claude Code format", () => {
    expect(isSkynetToolName("mcp__skynet__create_agent")).toBe(true);
    expect(isSkynetToolName("mcp__skynet__list_agents")).toBe(true);
  });

  it("detects skynet_voice variant", () => {
    expect(isSkynetToolName("mcp__skynet_voice__create_agent")).toBe(true);
    expect(isSkynetToolName("skynet_voice.create_agent")).toBe(true);
  });

  it("excludes speak tools", () => {
    expect(isSkynetToolName("mcp__skynet_voice__speak")).toBe(false);
    expect(isSkynetToolName("mcp__skynet__speak")).toBe(false);
    expect(isSkynetToolName("skynet.speak")).toBe(false);
  });

  it("detects Codex dot format", () => {
    expect(isSkynetToolName("skynet.create_agent")).toBe(true);
  });

  it("rejects non-skynet tools", () => {
    expect(isSkynetToolName("Bash")).toBe(false);
    expect(isSkynetToolName("Read")).toBe(false);
    expect(isSkynetToolName("mcp__other_server__some_tool")).toBe(false);
  });
});

describe("getSkynetToolLeafName", () => {
  it("extracts leaf from Claude Code format", () => {
    expect(getSkynetToolLeafName("mcp__skynet__create_agent")).toBe("create_agent");
  });

  it("extracts leaf from Codex format", () => {
    expect(getSkynetToolLeafName("skynet.create_agent")).toBe("create_agent");
    expect(getSkynetToolLeafName("skynet.list_agents")).toBe("list_agents");
  });

  it("returns null for non-skynet tools", () => {
    expect(getSkynetToolLeafName("Bash")).toBeNull();
  });
});
