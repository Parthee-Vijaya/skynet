#!/usr/bin/env node
/**
 * Skynet MCP-stdio-bridge.
 *
 * Spawnes som subproces af Claude Desktop / Cursor / andre MCP-clients,
 * og eksponerer Skynet portal's 33+ tools (rejseplanen, vejret, dmi-varsler,
 * Telegram-reminder, schedule_imessage_reminder, send_telegram_message,
 * read_traffic, get_news m.fl.) som MCP-tools.
 *
 * Arkitektur:
 *   stdio MCP-protokol  ⇄  denne bridge  ⇄  http://localhost:3100/api/tools/*
 *
 * Opstart:
 *   1. Henter TOOLS-listen fra portal (/api/tools/list) ved boot
 *   2. Registrerer hver Skynet-tool som MCP-tool 1:1 (samme JSON-schema)
 *   3. Når clienten kalder et tool: POSTer til /api/tools/execute med name+args
 *   4. Returnerer dispatcherens content tilbage til clienten
 *
 * Auth:
 *   control_token læses fra:
 *     a. SKYNET_CONTROL_TOKEN env-var
 *     b. Skynet's egen settings-DB (best-effort fallback)
 *
 * Failure-modes:
 *   - Portal nede ved boot → ListTools fejler med klar besked
 *   - Tool-kald mens portal er nede → MCP returnerer error-content
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool as McpTool,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface SkynetTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

interface ToolListResponse {
  tools: SkynetTool[];
}

interface ToolExecuteResponse {
  ok: boolean;
  content?: string;
  blocked?: boolean;
  error?: string;
}

const PORTAL_URL = process.env.SKYNET_PORTAL_URL ?? "http://localhost:3100";

function getControlToken(): string {
  const fromEnv = process.env.SKYNET_CONTROL_TOKEN;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();

  // Fallback: læs direkte fra Skynet's SQLite (best-effort).
  // MCP-bridgen kan blive spawnet uden at brugeren har sat env-var manuelt,
  // men hvis vi finder DB'en i monorepoet kan vi udlede tokenet.
  const candidates = [
    process.env.SKYNET_DB_PATH,
    join(homedir(), "Desktop/Claude/projekter/skynet/packages/portal/data/skynet.db"),
    join(process.cwd(), "data/skynet.db"),
    join(process.cwd(), "../portal/data/skynet.db"),
  ].filter((p): p is string => Boolean(p));

  for (const p of candidates) {
    try {
      // better-sqlite3 er ikke en dependency her — brug shell ud, det er en
      // simpel select og kun ved boot. Failsafe: returnér tom streng → portal
      // svarer 401 og brugeren får besked om at sætte env-var.
      const buf = readFileSync(p);
      // SQLite header-check — undgår at spawne sqlite3 hvis filen ikke findes
      if (buf.subarray(0, 16).toString("utf-8").startsWith("SQLite format 3")) {
        // Vi kan ikke parse SQLite uden lib her, så vi giver bare op og lader
        // brugeren sætte env-var.
        break;
      }
    } catch { /* prøv næste */ }
  }
  return "";
}

const TOKEN = getControlToken();
if (!TOKEN) {
  // Logging må ikke ramme stdout (det er MCP-protokollen) — alt diagnose-output
  // skal til stderr.
  process.stderr.write(
    "[skynet-mcp] ⚠ SKYNET_CONTROL_TOKEN ikke sat. Skynet portal vil afvise kald.\n" +
    "  Sæt env-var i Claude Desktop config: \"env\":{\"SKYNET_CONTROL_TOKEN\":\"...\"}.\n" +
    "  Tokenet findes med: sqlite3 ~/.../skynet.db \"SELECT value FROM settings WHERE key='control_token'\"\n",
  );
}

async function fetchToolList(): Promise<McpTool[]> {
  const res = await fetch(`${PORTAL_URL}/api/tools/list`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Portal /api/tools/list fejlede ${res.status}: ${txt.slice(0, 160)}`);
  }
  const data = (await res.json()) as ToolListResponse;
  return data.tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    // SDK kræver properties: Record<string, object>; vores schema lagrer dem
    // som Record<string, unknown> (mere fleksibelt format), så vi cast'er
    // her — de er JSON-objekter i praksis, schema-validering sker i portal.
    inputSchema: t.function.parameters as McpTool["inputSchema"],
  }));
}

async function executeTool(name: string, args: Record<string, unknown>): Promise<{
  text: string;
  isError: boolean;
}> {
  try {
    const res = await fetch(`${PORTAL_URL}/api/tools/execute`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, args }),
      signal: AbortSignal.timeout(120_000),
    });
    const data = (await res.json()) as ToolExecuteResponse;
    if (!res.ok || !data.ok) {
      return {
        text: `Tool '${name}' fejlede: ${data.error ?? `HTTP ${res.status}`}${data.blocked ? " (blocked — kræver bekræftelse)" : ""}`,
        isError: true,
      };
    }
    return { text: data.content ?? "", isError: false };
  } catch (e) {
    return {
      text: `Tool '${name}' kunne ikke kontakte portal på ${PORTAL_URL}: ${e instanceof Error ? e.message : "ukendt"}`,
      isError: true,
    };
  }
}

async function main() {
  const server = new Server(
    {
      name: "skynet",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Cache toollisten ved boot — undgår at portalen rammes på hver ListTools-request
  let cachedTools: McpTool[] | null = null;
  let lastFetchAt = 0;
  const CACHE_TTL = 60_000; // 1 min — toolset ændrer sig sjældent

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    if (!cachedTools || Date.now() - lastFetchAt > CACHE_TTL) {
      try {
        cachedTools = await fetchToolList();
        lastFetchAt = Date.now();
      } catch (e) {
        process.stderr.write(`[skynet-mcp] fetchToolList fejl: ${e instanceof Error ? e.message : "ukendt"}\n`);
        // Hvis vi har en gammel cache så bevar den; ellers tom liste
        cachedTools = cachedTools ?? [];
      }
    }
    return { tools: cachedTools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const result = await executeTool(name, (args ?? {}) as Record<string, unknown>);
    return {
      content: [{ type: "text", text: result.text }],
      isError: result.isError || undefined,
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[skynet-mcp] connected · portal=${PORTAL_URL}\n`);
}

main().catch((e) => {
  process.stderr.write(`[skynet-mcp] fatal: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
