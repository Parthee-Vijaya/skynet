#!/usr/bin/env npx tsx

import assert from "node:assert";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getDaemonHost,
  normalizeDaemonHost,
  resolveDaemonTarget,
  resolveDefaultDaemonHosts,
} from "../src/utils/client.js";
import { resolveCliVersion } from "../src/version.js";

console.log("=== CLI IPC Target Helpers ===\n");

{
  console.log("Test 1: unix hosts resolve to ws+unix URLs");
  const target = resolveDaemonTarget("unix:///tmp/skynet.sock");
  assert.deepStrictEqual(target, {
    type: "ipc",
    url: "ws+unix:///tmp/skynet.sock:/ws",
    socketPath: "/tmp/skynet.sock",
  });
  console.log("✓ unix hosts resolve to ws+unix URLs\n");
}

{
  console.log("Test 2: pipe hosts preserve the Node socketPath transport form");
  const target = resolveDaemonTarget("pipe://\\\\.\\pipe\\skynet-managed-test");
  assert.deepStrictEqual(target, {
    type: "ipc",
    url: "ws://localhost/ws",
    socketPath: "\\\\.\\pipe\\skynet-managed-test",
  });
  console.log("✓ pipe hosts preserve Node socketPath transport form\n");
}

{
  console.log("Test 3: local unix socket paths normalize into IPC daemon targets");
  assert.strictEqual(normalizeDaemonHost("/tmp/skynet.sock"), "unix:///tmp/skynet.sock");
  console.log("✓ local unix socket paths normalize into IPC daemon targets\n");
}

{
  console.log("Test 3b: Windows absolute paths are NOT treated as unix sockets");
  assert.strictEqual(normalizeDaemonHost("C:\\Users\\foo\\.skynet\\skynet.sock"), null);
  assert.strictEqual(normalizeDaemonHost("D:\\project\\socket"), null);
  console.log("✓ Windows absolute paths are not treated as unix sockets\n");
}

{
  console.log("Test 4: default host resolution tries local IPC first, then localhost fallback");
  const skynetHome = mkdtempSync(path.join(os.tmpdir(), "skynet-client-targets-"));
  try {
    mkdirSync(skynetHome, { recursive: true });
    writeFileSync(
      path.join(skynetHome, "skynet.pid"),
      JSON.stringify({ pid: process.pid, listen: "/tmp/skynet-from-pid.sock" }),
    );
    assert.deepStrictEqual(resolveDefaultDaemonHosts({ SKYNET_HOME: skynetHome }), [
      "unix:///tmp/skynet-from-pid.sock",
      "localhost:6767",
    ]);
    const previousHome = process.env.SKYNET_HOME;
    const previousHost = process.env.SKYNET_HOST;
    process.env.SKYNET_HOME = skynetHome;
    delete process.env.SKYNET_HOST;
    assert.strictEqual(getDaemonHost(), "unix:///tmp/skynet-from-pid.sock");
    if (previousHome === undefined) delete process.env.SKYNET_HOME;
    else process.env.SKYNET_HOME = previousHome;
    if (previousHost === undefined) delete process.env.SKYNET_HOST;
    else process.env.SKYNET_HOST = previousHost;
  } finally {
    rmSync(skynetHome, { recursive: true, force: true });
  }
  console.log("✓ default host resolution tries local IPC first, then localhost fallback\n");
}

{
  console.log("Test 5: configured TCP host is preserved before the localhost fallback");
  const skynetHome = mkdtempSync(path.join(os.tmpdir(), "skynet-client-targets-tcp-"));
  try {
    assert.deepStrictEqual(
      resolveDefaultDaemonHosts({
        SKYNET_HOME: skynetHome,
        SKYNET_LISTEN: "127.0.0.1:7777",
      }),
      ["127.0.0.1:7777", "localhost:6767"],
    );
  } finally {
    rmSync(skynetHome, { recursive: true, force: true });
  }
  console.log("✓ configured TCP host is preserved before the localhost fallback\n");
}

{
  console.log("Test 6: CLI app version resolves for daemon hello compatibility");
  assert.match(resolveCliVersion(), /^\d+\.\d+\.\d+/);
  console.log("✓ CLI app version resolves for daemon hello compatibility\n");
}

{
  console.log("Test 7: local IPC still takes priority over configured TCP hosts");
  const skynetHome = mkdtempSync(path.join(os.tmpdir(), "skynet-client-targets-order-"));
  try {
    mkdirSync(skynetHome, { recursive: true });
    writeFileSync(
      path.join(skynetHome, "skynet.pid"),
      JSON.stringify({ pid: process.pid, listen: "/tmp/skynet-priority.sock" }),
    );
    assert.deepStrictEqual(
      resolveDefaultDaemonHosts({
        SKYNET_HOME: skynetHome,
        SKYNET_LISTEN: "127.0.0.1:7777",
      }),
      ["unix:///tmp/skynet-priority.sock", "127.0.0.1:7777", "localhost:6767"],
    );
  } finally {
    rmSync(skynetHome, { recursive: true, force: true });
  }
  console.log("✓ local IPC still takes priority over configured TCP hosts\n");
}

console.log("=== All CLI IPC target tests passed ===");
