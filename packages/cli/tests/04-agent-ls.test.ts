#!/usr/bin/env npx tsx

/**
 * Phase 3: LS Command Tests
 *
 * Tests the ls command - listing agents (top-level command).
 * Since daemon may not be running, we test both:
 * - Help and argument parsing
 * - Graceful error handling when daemon not running
 * - JSON output format
 *
 * Tests:
 * - skynet --help shows ls command
 * - skynet ls --help shows options
 * - skynet ls returns empty list or error when no daemon
 * - skynet ls --json returns valid JSON (or error)
 * - skynet ls -a flag is accepted
 * - skynet ls -g flag is accepted
 * - skynet ls does not support --ui
 */

import assert from "node:assert";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { runLocalSkynet } from "./helpers/local-cli.ts";

console.log("=== LS Command Tests ===\n");

// Get random port that's definitely not in use (never 6767)
const port = 10000 + Math.floor(Math.random() * 50000);
const skynetHome = await mkdtemp(join(tmpdir(), "skynet-test-home-"));

try {
  // Test 1: skynet --help shows ls command
  {
    console.log("Test 1: skynet --help shows ls command");
    const result = await runLocalSkynet(["--help"]);
    assert.strictEqual(result.exitCode, 0, "skynet --help should exit 0");
    assert(result.stdout.includes("ls"), "help should mention ls command");
    console.log("✓ skynet --help shows ls command\n");
  }

  // Test 2: skynet ls --help shows options
  {
    console.log("Test 2: skynet ls --help shows options");
    const result = await runLocalSkynet(["ls", "--help"]);
    assert.strictEqual(result.exitCode, 0, "skynet ls --help should exit 0");
    assert(result.stdout.includes("-a"), "help should mention -a flag");
    assert(result.stdout.includes("--all"), "help should mention --all flag");
    assert(result.stdout.includes("-g"), "help should mention -g flag");
    assert(result.stdout.includes("--global"), "help should mention --global flag");
    assert(result.stdout.includes("--host"), "help should mention --host option");
    assert(!result.stdout.includes("--ui"), "help should not mention --ui");
    console.log("✓ skynet ls --help shows options\n");
  }

  // Test 3: skynet ls returns error when no daemon running
  {
    console.log("Test 3: skynet ls handles daemon not running");
    const result = await runLocalSkynet(["ls"], {
      SKYNET_HOST: `localhost:${port}`,
      SKYNET_HOME: skynetHome,
    });
    // Should fail because daemon not running
    assert.notStrictEqual(result.exitCode, 0, "should fail when daemon not running");
    const output = result.stdout + result.stderr;
    const hasError =
      output.toLowerCase().includes("daemon") ||
      output.toLowerCase().includes("connect") ||
      output.toLowerCase().includes("cannot");
    assert(hasError, "error message should mention connection issue");
    console.log("✓ skynet ls handles daemon not running\n");
  }

  // Test 4: skynet ls --json returns valid JSON error
  {
    console.log("Test 4: skynet ls --json handles errors");
    const result = await runLocalSkynet(["ls", "--json"], {
      SKYNET_HOST: `localhost:${port}`,
      SKYNET_HOME: skynetHome,
    });
    // Should still fail (daemon not running)
    assert.notStrictEqual(result.exitCode, 0, "should fail when daemon not running");
    // But output should be valid JSON if present
    const output = result.stdout.trim();
    if (output.length > 0) {
      try {
        JSON.parse(output);
        console.log("✓ skynet ls --json outputs valid JSON error\n");
      } catch {
        // Empty or stderr-only output is acceptable
        console.log("✓ skynet ls --json handled error (output may be in stderr)\n");
      }
    } else {
      console.log("✓ skynet ls --json handled error gracefully\n");
    }
  }

  // Test 5: skynet ls -a flag is accepted
  {
    console.log("Test 5: skynet ls -a flag is accepted");
    const result = await runLocalSkynet(["ls", "-a"], {
      SKYNET_HOST: `localhost:${port}`,
      SKYNET_HOME: skynetHome,
    });
    // Will fail due to no daemon, but flag should be parsed without error
    // (no "unknown option" error)
    const output = result.stdout + result.stderr;
    assert(!output.includes("unknown option"), "should accept -a flag");
    assert(!output.includes("error: option"), "should not have option parsing error");
    console.log("✓ skynet ls -a flag is accepted\n");
  }

  // Test 6: skynet ls -g flag is accepted
  {
    console.log("Test 6: skynet ls -g flag is accepted");
    const result = await runLocalSkynet(["ls", "-g"], {
      SKYNET_HOST: `localhost:${port}`,
      SKYNET_HOME: skynetHome,
    });
    const output = result.stdout + result.stderr;
    assert(!output.includes("unknown option"), "should accept -g flag");
    assert(!output.includes("error: option"), "should not have option parsing error");
    console.log("✓ skynet ls -g flag is accepted\n");
  }

  // Test 7: skynet ls -ag combined flags are accepted
  {
    console.log("Test 7: skynet ls -ag combined flags are accepted");
    const result = await runLocalSkynet(["ls", "-ag"], {
      SKYNET_HOST: `localhost:${port}`,
      SKYNET_HOME: skynetHome,
    });
    const output = result.stdout + result.stderr;
    assert(!output.includes("unknown option"), "should accept -ag flags");
    assert(!output.includes("error: option"), "should not have option parsing error");
    console.log("✓ skynet ls -ag combined flags are accepted\n");
  }

  // Test 8: -q (quiet) flag is accepted globally
  {
    console.log("Test 8: -q (quiet) flag is accepted");
    const result = await runLocalSkynet(["-q", "ls"], {
      SKYNET_HOST: `localhost:${port}`,
      SKYNET_HOME: skynetHome,
    });
    const output = result.stdout + result.stderr;
    assert(!output.includes("unknown option"), "should accept -q flag");
    assert(!output.includes("error: option"), "should not have option parsing error");
    console.log("✓ -q (quiet) flag is accepted\n");
  }

  // Test 9: skynet ls --ui is rejected (flag removed)
  {
    console.log("Test 9: skynet ls --ui is rejected");
    const result = await runLocalSkynet(["ls", "--ui"], {
      SKYNET_HOST: `localhost:${port}`,
      SKYNET_HOME: skynetHome,
    });
    assert.notStrictEqual(result.exitCode, 0, "should fail for removed --ui flag");
    const output = result.stdout + result.stderr;
    assert(output.includes("unknown option"), "should report unknown option for --ui");
    console.log("✓ skynet ls --ui is rejected\n");
  }
} finally {
  // Clean up temp directory
  await rm(skynetHome, { recursive: true, force: true });
}

console.log("=== All ls tests passed ===");
