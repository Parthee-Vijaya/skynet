#!/usr/bin/env bash
# scripts/install-mcp-bridge.sh
#
# Idempotent installer der bygger Skynet MCP-stdio-bridgen og registrerer
# den i Claude Desktop's config. Kan køres flere gange — overskriver kun
# 'mcpServers.skynet'-noden, lader andre MCP-servere være.
#
# Hvad scriptet gør:
#   1. Bygger packages/mcp/ (tsc → dist/server.js)
#   2. Læser control_token fra Skynet's SQLite
#   3. Patcher ~/Library/Application Support/Claude/claude_desktop_config.json
#   4. Beder dig genstarte Claude Desktop manuelt (vi rør ikke ved appen)
#
# Brug:
#   bash scripts/install-mcp-bridge.sh

set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MCP_DIR="$REPO_DIR/packages/mcp"
SERVER_JS="$MCP_DIR/dist/server.js"
DB="$REPO_DIR/packages/portal/data/skynet.db"
CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"

# ── 1. Build ────────────────────────────────────────────────────────────────
echo "→ Bygger MCP-bridge…"
(cd "$MCP_DIR" && npm install --silent && npm run build --silent)
if [ ! -f "$SERVER_JS" ]; then
  echo "✗ Build fejlede: $SERVER_JS findes ikke"
  exit 1
fi
echo "✓ $SERVER_JS"

# ── 2. Læs control_token ────────────────────────────────────────────────────
if [ ! -f "$DB" ]; then
  echo "✗ Skynet DB findes ikke: $DB"
  echo "  Start portalen mindst én gang så DB'en oprettes:"
  echo "    launchctl kickstart -k gui/\$(id -u)/com.skynet.portal"
  exit 1
fi
TOKEN=$(sqlite3 "$DB" "SELECT value FROM settings WHERE key='control_token'" 2>/dev/null || echo "")
if [ -z "$TOKEN" ]; then
  echo "✗ Kunne ikke læse control_token fra DB. Har portalen kørt mindst én gang?"
  exit 1
fi
echo "✓ control_token læst (${#TOKEN} bytes)"

# ── 3. Patch Claude Desktop config ──────────────────────────────────────────
if [ ! -f "$CONFIG" ]; then
  echo "→ Opretter ny Claude Desktop config…"
  mkdir -p "$(dirname "$CONFIG")"
  echo '{"mcpServers":{}}' > "$CONFIG"
fi

# Backup før edit
cp "$CONFIG" "$CONFIG.bak-$(date +%Y%m%d-%H%M%S)"

python3 - "$CONFIG" "$SERVER_JS" "$TOKEN" <<'PYEOF'
import json, sys
config_path, server_js, token = sys.argv[1], sys.argv[2], sys.argv[3]
with open(config_path) as f:
    data = json.load(f)
data.setdefault('mcpServers', {})
data['mcpServers']['skynet'] = {
    'command': 'node',
    'args': [server_js],
    'env': {
        'SKYNET_CONTROL_TOKEN': token,
        'SKYNET_PORTAL_URL': 'http://localhost:3100',
    },
}
with open(config_path, 'w') as f:
    json.dump(data, f, indent=2)
print(f"✓ skynet MCP-server registreret · {len(data['mcpServers'])} servere total")
PYEOF

echo
echo "Færdig. Genstart Claude Desktop for at loade MCP-serveren:"
echo "  killall Claude && open -a Claude"
echo
echo "Tools fra Skynet vil dukke op under 'skynet' i tool-picker'en."
echo "Hvis de ikke gør, tjek: ~/Library/Logs/Claude/mcp-server-skynet.log"
