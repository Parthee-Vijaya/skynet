#!/usr/bin/env bash
# Refresher: kører en minimal claude -p-kald så Stop-hooken fyrer og
# opdaterer ~/.claude/rate-limits.json. Bruges af LaunchAgent
# com.skynet.refresh-rate-limits hver 4 time så cockpit-widget viser
# friske plan-usage data — også når brugeren ikke aktivt bruger Claude
# Code.
#
# SKYNET_REFRESH=1 env-var settes så Stop-hooken kan skippe push-
# notifikationen for denne auto-refresh-kørsel (ellers ville brugeren
# få en push hver 4 time uden grund).
#
# Cost: ~$0.01 pr kørsel × 6/dag = ~$0.06/dag = ~$1.80/mdr.

# Find claude-bin (samme rækkefølge som /api/claude/continue bruger)
for candidate in "$HOME/.local/bin/claude" "/opt/homebrew/bin/claude" "/usr/local/bin/claude" "/usr/bin/claude"; do
  if [ -x "$candidate" ]; then
    CLAUDE="$candidate"
    break
  fi
done

if [ -z "${CLAUDE:-}" ]; then
  echo "[refresh-rate-limits] claude-CLI ikke fundet" >&2
  exit 1
fi

# Kør minimal prompt — vi bruger "ok" som er kort og giver minimalt token-forbrug
# --no-session-persistence så vi ikke fylder ~/.claude/projects med refresh-runs
SKYNET_REFRESH=1 "$CLAUDE" -p "ok" \
  --no-session-persistence \
  --max-turns 1 \
  > /dev/null 2>&1 || true

exit 0
