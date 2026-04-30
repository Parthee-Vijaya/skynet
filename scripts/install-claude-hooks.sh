#!/usr/bin/env bash
# scripts/install-claude-hooks.sh
#
# Idempotent installer der sætter Claude Code op til at fodre Skynet's
# cockpit-widget med live rate-limits-data, plus fyrer push-notifikation
# til iPhone når en Claude Code-session er færdig.
#
# Resultat efter kørsel:
#
#   ~/.claude/skynet-stop-hook.sh              · push + rate-limits-dump
#   ~/.claude/statusline-command.sh             · statusline + rate-limits-dump
#   ~/.claude/rate-limits.json                  · spises af Skynet's claude-collector
#   ~/.claude/settings.json                     · hooks-konfig opdateret
#
# Kan køres flere gange — overskriver hooks med nyeste version, og
# spørger ikke før den gør det. Settings.json patches non-destruktivt:
# eksisterende keys bevares, vi tilføjer eller opdaterer kun 'hooks.Stop'
# og 'statusLine'.
#
# Brug:
#   bash scripts/install-claude-hooks.sh
#
# Ingen argumenter. Læser SKYNET_CONTROL_TOKEN fra Skynet's SQLite hvis
# tilgængelig, ellers fra env-var, ellers genererer en placeholder der
# skal udfyldes manuelt før push virker.

set -e

CLAUDE_DIR="$HOME/.claude"
SETTINGS="$CLAUDE_DIR/settings.json"
STOP_HOOK="$CLAUDE_DIR/skynet-stop-hook.sh"
STATUS_HOOK="$CLAUDE_DIR/statusline-command.sh"

mkdir -p "$CLAUDE_DIR"

# ── Find control_token ───────────────────────────────────────────────────────
TOKEN="${SKYNET_CONTROL_TOKEN:-}"
SKYNET_DB="$(dirname "$0")/../packages/portal/data/skynet.db"
if [ -z "$TOKEN" ] && [ -f "$SKYNET_DB" ] && command -v sqlite3 >/dev/null 2>&1; then
  TOKEN=$(sqlite3 "$SKYNET_DB" "SELECT value FROM settings WHERE key='control_token'" 2>/dev/null || true)
fi
if [ -z "$TOKEN" ]; then
  TOKEN="REPLACE_WITH_CONTROL_TOKEN"
  echo "⚠ Kunne ikke læse control_token fra Skynet DB."
  echo "  Hooket installeres med placeholder — push virker ikke før du erstatter"
  echo "  REPLACE_WITH_CONTROL_TOKEN i $STOP_HOOK"
fi

# ── Skriv Stop-hook (push + rate-limits dump + sessionId-extraction) ────────
cat > "$STOP_HOOK" <<EOF
#!/usr/bin/env bash
# Skynet Claude Code Stop-hook (genereret af scripts/install-claude-hooks.sh)
#
# Tre opgaver:
#   1. Push-notifikation til iPhone via /api/agent-events MED sessionId+cwd
#      så Skynet kan læse JSONL'en og bygge en detaljeret besked med
#      "Du: '...', Claude: '...', tools: [...]"
#   2. Dump rate_limits til ~/.claude/rate-limits.json så cockpit-widget
#      kan vise live plan-usage
#   3. Send via Telegram-bridge hvis konfigureret (håndteres af endpoint)
#
# Fejler silent — påvirker aldrig Claude Code-sessionen.

TOKEN="$TOKEN"
PROJECT=\$(basename "\${PWD:-unknown}" | tr -cd '[:alnum:]_-' | cut -c1-50)
[ -z "\$PROJECT" ] && PROJECT="unknown"

# Læs hook-input én gang — Claude Code sender JSON-envelope på stdin
INPUT=\$(cat 2>/dev/null || echo "{}")

# 1) Dump rate_limits til cockpit-widget
echo "\$INPUT" | python3 -c "
import sys, json, time, pathlib
try:
    d = json.load(sys.stdin)
    rl = d.get('rate_limits')
    if rl:
        path = pathlib.Path.home() / '.claude' / 'rate-limits.json'
        path.write_text(json.dumps({'rate_limits': rl, 'updated_at': int(time.time())}))
except Exception:
    pass
" 2>/dev/null || true

# 2) Udled session_id + cwd fra envelope (begge optional)
SESSION_ID=\$(echo "\$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('session_id') or d.get('sessionId') or '')
except Exception:
    pass
" 2>/dev/null || echo "")

ENVELOPE_CWD=\$(echo "\$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('cwd') or '')
except Exception:
    pass
" 2>/dev/null || echo "")

EFFECTIVE_CWD="\${ENVELOPE_CWD:-\$PWD}"

# 3) Byg JSON-payload med sessionId+cwd så Skynet kan læse JSONL
PAYLOAD=\$(python3 -c "
import json
print(json.dumps({
    'agent': 'claude-code',
    'session': '\${PROJECT}',
    'event': 'finished',
    'sessionId': '\${SESSION_ID}' if '\${SESSION_ID}' else None,
    'cwd': '\${EFFECTIVE_CWD}' if '\${EFFECTIVE_CWD}' else None,
    'message': 'Claude Code færdig i \${PROJECT}',
}))
" 2>/dev/null)

if [ -z "\$PAYLOAD" ]; then
  PAYLOAD="{\\"agent\\":\\"claude-code\\",\\"session\\":\\"\${PROJECT}\\",\\"event\\":\\"finished\\",\\"message\\":\\"Claude Code færdig i \${PROJECT}\\"}"
fi

# 4) Push til Skynet (5s timeout — JSONL-læsning kan tage et øjeblik)
curl -sS --max-time 5 -X POST http://localhost:3100/api/agent-events \\
  -H "Authorization: Bearer \$TOKEN" \\
  -H "Content-Type: application/json" \\
  -d "\$PAYLOAD" \\
  > /dev/null 2>&1 || true

exit 0
EOF
chmod +x "$STOP_HOOK"
echo "✓ Stop-hook  → $STOP_HOOK"

# ── Skriv statusline-hook hvis det ikke findes (bevarer eksisterende custom) ─
if [ ! -f "$STATUS_HOOK" ]; then
  cat > "$STATUS_HOOK" <<'EOF'
#!/bin/bash
# Skynet statusline-hook — dumper rate_limits til cockpit-widget
# plus viser standard statusline med tokens, % og varigheder.

INPUT=$(cat)

# Dump rate_limits til ~/.claude/rate-limits.json så Skynet kan læse det
echo "$INPUT" | python3 -c "
import sys, json, time, pathlib
try:
    d = json.load(sys.stdin)
    rl = d.get('rate_limits')
    if rl:
        path = pathlib.Path.home() / '.claude' / 'rate-limits.json'
        path.write_text(json.dumps({'rate_limits': rl, 'updated_at': int(time.time())}))
except Exception:
    pass
" 2>/dev/null

# Minimal statusline (tilpas selv hvis du vil have rigere display)
echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    m = d.get('model', {})
    name = m.get('display_name', m.get('id', '?')) if isinstance(m, dict) else str(m)
    cw = d.get('context_window', {})
    pct = cw.get('used_percentage', 0) or 0
    rl = d.get('rate_limits', {})
    fh = (rl.get('five_hour') or {}).get('used_percentage', 0) or 0
    sd = (rl.get('seven_day') or {}).get('used_percentage', 0) or 0
    print(f'🤖 {name}  📊 ctx {pct:.0f}%  ⚡5h {fh:.0f}%  📅7d {sd:.0f}%')
except Exception:
    print('claude-code')
"
EOF
  chmod +x "$STATUS_HOOK"
  echo "✓ Statusline → $STATUS_HOOK (default — tilpas hvis du vil)"
else
  chmod +x "$STATUS_HOOK"
  echo "✓ Statusline → $STATUS_HOOK (eksisterende — bevaret)"
fi

# ── Patch settings.json non-destruktivt ─────────────────────────────────────
python3 <<EOF
import json, pathlib

settings_path = pathlib.Path("$SETTINGS")
data = {}
if settings_path.exists():
    try:
        data = json.loads(settings_path.read_text())
    except Exception:
        data = {}

# Ensure hooks.Stop has our hook
hooks = data.setdefault("hooks", {})
stop_list = hooks.setdefault("Stop", [])

our_cmd = "bash $STOP_HOOK"
already = any(
    any(h.get("command") == our_cmd for h in entry.get("hooks", []))
    for entry in stop_list
)
if not already:
    stop_list.append({"hooks": [{"type": "command", "command": our_cmd}]})
    print("✓ hooks.Stop  patched (skynet-stop-hook tilføjet)")
else:
    print("✓ hooks.Stop  allerede konfigureret")

# Ensure statusLine peger på vores hook
desired_status = {"type": "command", "command": "$STATUS_HOOK"}
if data.get("statusLine") != desired_status:
    data["statusLine"] = desired_status
    print("✓ statusLine  sat til skynet hook")
else:
    print("✓ statusLine  allerede konfigureret")

settings_path.write_text(json.dumps(data, indent=2) + "\n")
EOF

echo
echo "Færdig. Næste gang du bruger Claude Code (interaktivt eller -p),"
echo "vil ~/.claude/rate-limits.json blive opdateret automatisk."
echo "Skynet cockpit-widget poller hvert 60. sek."
