# @skynet/mcp — MCP stdio-bridge

Eksponerer Skynet portal's 33+ tools (rejseplanen, vejret, dmi-varsler, get_news, schedule_telegram_reminder, send_telegram_message m.fl.) som MCP-tools til Claude Desktop, Cursor, ChatGPT-MCP og andre clients der taler [Model Context Protocol](https://modelcontextprotocol.io/).

## Arkitektur

```
Claude Desktop / Cursor          packages/mcp                packages/portal
       │                              │                            │
       │   stdio JSON-RPC             │   HTTP + Bearer            │
       └──────────────────────────────┼────────────────────────────┘
                                      │
                    tools/list  →  GET /api/tools/list
                    tools/call  →  POST /api/tools/execute
```

`packages/mcp` er en tynd stdio-bridge — alle tools eksekveres af den kørende portal via dispatcher.ts. Bridgen er stateless og kan starte/stoppe uden at miste data.

## Setup — Claude Desktop

1. Byg bridgen:
   ```bash
   cd packages/mcp && npm run build
   ```

2. Find dit control_token:
   ```bash
   sqlite3 packages/portal/data/skynet.db "SELECT value FROM settings WHERE key='control_token'"
   ```

3. Tilføj til `~/Library/Application Support/Claude/claude_desktop_config.json`:
   ```json
   {
     "mcpServers": {
       "skynet": {
         "command": "node",
         "args": ["/Users/<dig>/sti/til/skynet/packages/mcp/dist/server.js"],
         "env": {
           "SKYNET_CONTROL_TOKEN": "<token-fra-step-2>",
           "SKYNET_PORTAL_URL": "http://localhost:3100"
         }
       }
     }
   }
   ```

4. Genstart Claude Desktop. Tools dukker op i tool-picker'en under `skynet`.

## Setup — Cursor / andre clients

Samme `command + args + env` pattern. Cursor's `~/.cursor/mcp.json`, Cline's settings osv.

## Test fra CLI

```bash
TOKEN=$(sqlite3 packages/portal/data/skynet.db "SELECT value FROM settings WHERE key='control_token'")

# Send 4 JSON-RPC beskeder via stdin og se svaret
{
  echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"cli","version":"1.0"}}}'
  echo '{"jsonrpc":"2.0","method":"notifications/initialized"}'
  echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
  echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"read_moon","arguments":{}}}'
} | SKYNET_CONTROL_TOKEN="$TOKEN" node packages/mcp/dist/server.js
```

## Hvad bridgen IKKE gør

- **LLM-loop** — der er ingen agent-loop her; én tool-kald per request. Hvis du vil have multi-turn LLM med tools, brug Skynet's egen `/api/siri` eller `/api/chat` (de bruger LangChain-runner internt).
- **Auth-rotation** — token er statisk i config. Ved rotate, opdater config + genstart client.
- **Sandbox** — destruktive tools (stop_service, restart_service) er default-blokkeret af `dispatchTool({ allowDestructive: false })`. MCP-bridgen sender altid `allowDestructive=false`. Hvis du vil tillade dem, ændre `executeTool()` til at sætte `allowDestructive: true` (men overvej sikkerhed først).

## Failure-modes

| Symptom | Årsag |
|---|---|
| `tools/list` returnerer tom liste | Portal er nede eller token forkert. Tjek `lsof -nP -iTCP:3100` + `[skynet-mcp]` linjer i Claude Desktop log |
| `tools/call` svarer `Tool 'X' kunne ikke kontakte portal` | Portal stoppet under runtime. Genstart `launchctl kickstart -k gui/$(id -u)/com.skynet.portal` |
| MCP-server crasher ved boot | Læs Claude Desktop's stderr-log: `~/Library/Logs/Claude/mcp-server-skynet.log` |
