/**
 * Test setup utilities for Skynet CLI E2E tests
 *
 * Critical rules from design doc:
 * 1. Port: Random port via 10000 + Math.floor(Math.random() * 50000) - NEVER 6767
 * 2. Protocol: WebSocket ONLY - daemon has no HTTP endpoints
 * 3. Temp dirs: Create temp directories for SKYNET_HOME and agent --cwd
 * 4. Model: Always --provider claude with haiku model for agent tests
 * 5. Cleanup: Kill daemon and remove temp dirs after each test
 */

import { $, ProcessPromise, sleep } from "zx";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const TEST_ENV_DEFAULTS = {
  SKYNET_LOCAL_SPEECH_AUTO_DOWNLOAD: process.env.SKYNET_LOCAL_SPEECH_AUTO_DOWNLOAD ?? "0",
  SKYNET_DICTATION_ENABLED: process.env.SKYNET_DICTATION_ENABLED ?? "0",
  SKYNET_VOICE_MODE_ENABLED: process.env.SKYNET_VOICE_MODE_ENABLED ?? "0",
};

function killPidTree(pid: number, signal: NodeJS.Signals): void {
  if (!Number.isInteger(pid) || pid <= 0) {
    return;
  }

  if (process.platform !== "win32") {
    try {
      process.kill(-pid, signal);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ESRCH") {
        return;
      }
    }
  }

  try {
    process.kill(pid, signal);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ESRCH") {
      throw error;
    }
  }
}

export interface TestContext {
  /** Random port for test daemon (never 6767) */
  port: number;
  /** Temp directory for SKYNET_HOME */
  skynetHome: string;
  /** Temp directory for agent working directory */
  workDir: string;
  /** Running daemon process */
  daemon: ProcessPromise | null;
  /** Run a skynet CLI command against the test daemon */
  skynet: (args: string[]) => ProcessPromise;
  /** Clean up all resources */
  cleanup: () => Promise<void>;
}

/**
 * Generate a random port for test daemon
 * NEVER uses 6767 (user's running daemon)
 */
export function getRandomPort(): number {
  return 10000 + Math.floor(Math.random() * 50000);
}

/**
 * Create isolated temp directories for testing
 */
export async function createTempDirs(): Promise<{ skynetHome: string; workDir: string }> {
  const skynetHome = await mkdtemp(join(tmpdir(), "skynet-test-home-"));
  const workDir = await mkdtemp(join(tmpdir(), "skynet-test-work-"));
  return { skynetHome, workDir };
}

/**
 * Wait for daemon to be ready by testing WebSocket connection
 * Uses `skynet agent ls` which connects via WebSocket
 */
export async function waitForDaemon(port: number, timeout = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const result = await $`SKYNET_HOST=localhost:${port} skynet agent ls`.nothrow();
      if (result.exitCode === 0) return;
    } catch {
      // Connection failed, keep trying
    }
    await sleep(100);
  }
  throw new Error(`Daemon failed to start on port ${port} within ${timeout}ms`);
}

/**
 * Start an isolated test daemon
 */
export async function startDaemon(port: number, skynetHome: string): Promise<ProcessPromise> {
  $.verbose = false;
  const daemon =
    $`SKYNET_HOME=${skynetHome} SKYNET_LISTEN=127.0.0.1:${port} SKYNET_RELAY_ENABLED=false SKYNET_LOCAL_SPEECH_AUTO_DOWNLOAD=${TEST_ENV_DEFAULTS.SKYNET_LOCAL_SPEECH_AUTO_DOWNLOAD} SKYNET_DICTATION_ENABLED=${TEST_ENV_DEFAULTS.SKYNET_DICTATION_ENABLED} SKYNET_VOICE_MODE_ENABLED=${TEST_ENV_DEFAULTS.SKYNET_VOICE_MODE_ENABLED} CI=true skynet daemon start --foreground`.nothrow();
  return daemon;
}

/**
 * Create a full test context with daemon, temp dirs, and helpers
 */
export async function createTestContext(): Promise<TestContext> {
  const port = getRandomPort();
  const { skynetHome, workDir } = await createTempDirs();

  // Helper to run CLI commands against test daemon
  const skynet = (args: string[]): ProcessPromise => {
    $.verbose = false;
    return $`SKYNET_HOST=localhost:${port} SKYNET_LOCAL_SPEECH_AUTO_DOWNLOAD=${TEST_ENV_DEFAULTS.SKYNET_LOCAL_SPEECH_AUTO_DOWNLOAD} SKYNET_DICTATION_ENABLED=${TEST_ENV_DEFAULTS.SKYNET_DICTATION_ENABLED} SKYNET_VOICE_MODE_ENABLED=${TEST_ENV_DEFAULTS.SKYNET_VOICE_MODE_ENABLED} skynet ${args}`.nothrow();
  };

  // Cleanup function
  const cleanup = async (): Promise<void> => {
    if (ctx.daemon) {
      if (typeof ctx.daemon.pid === "number") {
        killPidTree(ctx.daemon.pid, "SIGTERM");
        await sleep(250);
        killPidTree(ctx.daemon.pid, "SIGKILL");
      } else {
        ctx.daemon.kill();
      }
    }
    await rm(skynetHome, { recursive: true, force: true });
    await rm(workDir, { recursive: true, force: true });
  };

  const ctx: TestContext = {
    port,
    skynetHome,
    workDir,
    daemon: null,
    skynet,
    cleanup,
  };

  return ctx;
}

/**
 * Create a test context and start the daemon
 * Use this for tests that need a running daemon
 */
export async function createTestContextWithDaemon(): Promise<TestContext> {
  const ctx = await createTestContext();
  ctx.daemon = await startDaemon(ctx.port, ctx.skynetHome);
  await waitForDaemon(ctx.port);
  return ctx;
}

/**
 * Register cleanup handlers for process exit
 */
export function registerCleanupHandlers(cleanup: () => Promise<void>): void {
  const handler = async () => {
    await cleanup();
    process.exit(0);
  };

  process.on("exit", () => {
    // Can't await in exit handler, but at least try to kill daemon
  });
  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
}
