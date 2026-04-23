import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, rm } from "node:fs/promises";

import pino from "pino";
import {
  createSkynetDaemon,
  type SkynetDaemonConfig,
  type SkynetOpenAIConfig,
  type SkynetSpeechConfig,
} from "../bootstrap.js";
import type { AgentClient, AgentProvider } from "../agent/agent-sdk-types.js";
import { createTestAgentClients } from "./fake-agent-client.js";

type TestSkynetDaemonOptions = {
  downloadTokenTtlMs?: number;
  corsAllowedOrigins?: string[];
  listen?: string;
  logger?: Parameters<typeof createSkynetDaemon>[1];
  relayEnabled?: boolean;
  relayEndpoint?: string;
  agentClients?: Partial<Record<AgentProvider, AgentClient>>;
  skynetHomeRoot?: string;
  staticDir?: string;
  cleanup?: boolean;
  openai?: SkynetOpenAIConfig;
  speech?: SkynetSpeechConfig;
  voiceLlmProvider?: SkynetDaemonConfig["voiceLlmProvider"];
  voiceLlmProviderExplicit?: boolean;
  voiceLlmModel?: string | null;
  dictationFinalTimeoutMs?: number;
};

export type TestSkynetDaemon = {
  config: SkynetDaemonConfig;
  daemon: Awaited<ReturnType<typeof createSkynetDaemon>>;
  port: number;
  skynetHome: string;
  staticDir: string;
  close: () => Promise<void>;
};

const TEST_DAEMON_START_TIMEOUT_MS = 20_000;

async function startDaemonWithTimeout(
  daemon: Awaited<ReturnType<typeof createSkynetDaemon>>,
  timeoutMs: number,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      const timeoutError = new Error(
        `Timed out starting test daemon after ${timeoutMs}ms`,
      ) as Error & { code?: string };
      timeoutError.code = "TEST_DAEMON_START_TIMEOUT";
      reject(timeoutError);
    }, timeoutMs);

    daemon.start().then(
      () => {
        clearTimeout(timeoutHandle);
        resolve();
      },
      (error) => {
        clearTimeout(timeoutHandle);
        reject(error);
      },
    );
  });
}

export async function createTestSkynetDaemon(
  options: TestSkynetDaemonOptions = {},
): Promise<TestSkynetDaemon> {
  const maxAttempts = 8;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const skynetHomeRoot =
      options.skynetHomeRoot ?? (await mkdtemp(path.join(os.tmpdir(), "skynet-home-")));
    const skynetHome = path.join(skynetHomeRoot, ".skynet");
    await mkdir(skynetHome, { recursive: true });
    const staticDir = options.staticDir ?? (await mkdtemp(path.join(os.tmpdir(), "skynet-static-")));
    const listenHost = options.listen ?? "127.0.0.1";
    const config: SkynetDaemonConfig = {
      listen: `${listenHost}:0`,
      skynetHome,
      corsAllowedOrigins: options.corsAllowedOrigins ?? [],
      hostnames: true,
      mcpEnabled: true,
      staticDir,
      mcpDebug: false,
      agentClients: options.agentClients ?? createTestAgentClients(),
      agentStoragePath: path.join(skynetHome, "agents"),
      relayEnabled: options.relayEnabled ?? false,
      relayEndpoint: options.relayEndpoint ?? "relay.skynet.sh:443",
      appBaseUrl: "https://app.skynet.sh",
      openai: options.openai,
      speech: options.speech,
      voiceLlmProvider: options.voiceLlmProvider ?? null,
      voiceLlmProviderExplicit: options.voiceLlmProviderExplicit ?? false,
      voiceLlmModel: options.voiceLlmModel ?? null,
      dictationFinalTimeoutMs: options.dictationFinalTimeoutMs,
      downloadTokenTtlMs: options.downloadTokenTtlMs,
    };

    const logger = options.logger ?? pino({ level: "silent" });
    const daemon = await createSkynetDaemon(config, logger);
    try {
      await startDaemonWithTimeout(daemon, TEST_DAEMON_START_TIMEOUT_MS);
      const listenTarget = daemon.getListenTarget();
      if (!listenTarget || listenTarget.type !== "tcp") {
        throw new Error("Test daemon did not expose a bound TCP listen target");
      }

      const close = async (): Promise<void> => {
        await daemon.stop().catch(() => undefined);
        await daemon.agentManager.flush().catch(() => undefined);
        if (options.cleanup ?? true) {
          await new Promise((r) => setTimeout(r, 50));
          await rm(skynetHomeRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
          await rm(staticDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        }
      };

      return {
        config,
        daemon,
        port: listenTarget.port,
        skynetHome,
        staticDir,
        close,
      };
    } catch (error) {
      lastError = error;
      await daemon.stop().catch(() => undefined);
      await rm(skynetHomeRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      await rm(staticDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });

      if (
        (!isAddressInUseError(error) && !isStartupTimeoutError(error)) ||
        attempt === maxAttempts - 1
      ) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error("Failed to start test daemon");
}

function isAddressInUseError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const record = error as { code?: string };
  return record.code === "EADDRINUSE";
}

function isStartupTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const record = error as { code?: string };
  return record.code === "TEST_DAEMON_START_TIMEOUT";
}
