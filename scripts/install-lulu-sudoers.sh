#!/usr/bin/env bash
# Install passwordless sudoers entry for lulu-cli — required for Skynet's
# /firewall page to add/delete/reload rules without prompting for a password
# every time (the portal runs as a user-LaunchAgent and can't prompt).
#
# Run with: sudo scripts/install-lulu-sudoers.sh
#
# This installs /etc/sudoers.d/skynet-lulu with NOPASSWD on:
#   lulu-cli add *
#   lulu-cli delete *
#   lulu-cli reload
#
# Read-only commands (list, recent) don't need sudo, so they aren't included.

set -euo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo "Dette script skal køres som root: sudo $0" >&2
  exit 1
fi

# Find the user that invoked sudo (so we install for the right account).
TARGET_USER="${SUDO_USER:-${USER}}"
if [[ -z "$TARGET_USER" || "$TARGET_USER" == "root" ]]; then
  echo "Kan ikke detektere ikke-root brugeren — sæt SUDO_USER eller kør 'sudo -u <user> $0'." >&2
  exit 1
fi

# Locate lulu-cli — try Homebrew (Apple Silicon, Intel) and a generic fallback.
LULU_CLI=""
for p in /opt/homebrew/bin/lulu-cli /usr/local/bin/lulu-cli; do
  if [[ -x "$p" ]]; then
    LULU_CLI="$p"
    break
  fi
done
if [[ -z "$LULU_CLI" ]]; then
  if command -v lulu-cli >/dev/null 2>&1; then
    LULU_CLI="$(command -v lulu-cli)"
  fi
fi
if [[ -z "$LULU_CLI" ]]; then
  cat <<EOF >&2
Fandt ikke lulu-cli. Installer først:
  brew install woop/tap/lulu-cli

…og kør så dette script igen.
EOF
  exit 1
fi

SUDOERS_FILE="/etc/sudoers.d/skynet-lulu"
TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

cat > "$TMP_FILE" <<EOF
# Skynet — passwordless lulu-cli for $TARGET_USER (managed by install-lulu-sudoers.sh)
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
$TARGET_USER ALL=(ALL) NOPASSWD: $LULU_CLI add *, $LULU_CLI delete *, $LULU_CLI delete-match *, $LULU_CLI reload, $LULU_CLI enable *, $LULU_CLI disable *
EOF

# Validate before installing — visudo -c -f catches syntax errors.
if ! visudo -c -f "$TMP_FILE" >/dev/null 2>&1; then
  echo "Sudoers-fil-validering fejlede. Indhold:" >&2
  cat "$TMP_FILE" >&2
  exit 1
fi

install -m 0440 -o root -g wheel "$TMP_FILE" "$SUDOERS_FILE"
echo "✓ Installeret: $SUDOERS_FILE"
echo ""
echo "Test: sudo -u $TARGET_USER sudo -n $LULU_CLI --version"
if sudo -u "$TARGET_USER" sudo -n "$LULU_CLI" --version >/dev/null 2>&1; then
  echo "✓ Passwordless sudo virker"
else
  echo "⚠ Passwordless test fejlede — tjek visudo -c output"
fi

echo ""
echo "Skynet kan nu styre LuLu-regler uden prompt. Genstart portal for at re-detect:"
echo "  launchctl kickstart -k gui/\$(id -u)/com.skynet.portal"
