#!/usr/bin/env npx tsx

import assert from "node:assert";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveSkynetHomePath, resolveSkynetWorktreesDir } from "../src/commands/worktree/ls.js";

console.log("=== Worktree LS Path Helper Tests ===\n");

const originalSkynetHome = process.env.SKYNET_HOME;

try {
  {
    console.log("Test 1: resolves explicit SKYNET_HOME when set");
    process.env.SKYNET_HOME = "/tmp/skynet-explicit-home";

    assert.strictEqual(resolveSkynetHomePath(), "/tmp/skynet-explicit-home");
    assert.strictEqual(resolveSkynetWorktreesDir(), "/tmp/skynet-explicit-home/worktrees");
    console.log("\u2713 explicit SKYNET_HOME is respected\n");
  }

  {
    console.log("Test 2: falls back to homedir/.skynet when SKYNET_HOME is unset");
    delete process.env.SKYNET_HOME;

    assert.strictEqual(resolveSkynetHomePath(), join(homedir(), ".skynet"));
    assert.strictEqual(resolveSkynetWorktreesDir(), join(homedir(), ".skynet", "worktrees"));
    console.log("\u2713 fallback home path is derived from os.homedir()\n");
  }
} finally {
  if (originalSkynetHome === undefined) {
    delete process.env.SKYNET_HOME;
  } else {
    process.env.SKYNET_HOME = originalSkynetHome;
  }
}

console.log("=== All worktree ls path helper tests passed ===");
