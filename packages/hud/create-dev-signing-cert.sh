#!/bin/bash
# create-dev-signing-cert.sh — set up a persistent self-signed
# code-signing identity so macOS Keychain + TCC grants survive
# rebuilds. Run this ONCE. The cert lives in your login keychain
# (10-year validity) until you delete it.
#
# Why: run-dev.sh used adhoc "-" signing, which stamps the bundle
# with a designated requirement that changes every build. Keychain
# ACLs key on that requirement, so "Always Allow" never sticks and
# macOS re-prompts for the Gemini API key on every single launch.
# A persistent self-signed cert pins the requirement, and the
# "Always Allow" button starts working as intended.
#
# After running this:
#   1. The next `./run-dev.sh` signs with "Skynet Dev" identity.
#   2. First launch: macOS prompts once for Keychain access — click
#      "Always Allow" and it will stick on subsequent launches.
#
# Undo: open Keychain Access.app → search "Skynet Dev" → delete.

set -e

CERT_NAME="Skynet Dev"
DAYS=3650   # 10 years
PASS="skynet"   # transient PKCS#12 passphrase — the identity lives
                # as an unlocked item in login keychain after import

# Bail early if already installed
if security find-identity -v -p codesigning 2>/dev/null | grep -q "$CERT_NAME"; then
    echo "✓ Code-signing identity '$CERT_NAME' already in login keychain."
    security find-identity -v -p codesigning | grep "$CERT_NAME"
    exit 0
fi

TMPDIR=$(mktemp -d)
trap "rm -rf '$TMPDIR'" EXIT

echo "▶ Generating private key + self-signed cert…"
openssl req -x509 -newkey rsa:2048 -sha256 -days "$DAYS" -nodes \
    -keyout "$TMPDIR/key.pem" \
    -out "$TMPDIR/cert.pem" \
    -subj "/CN=$CERT_NAME/O=Skynet Development/C=DK" \
    -addext "keyUsage=critical,digitalSignature" \
    -addext "extendedKeyUsage=critical,codeSigning" \
    -addext "basicConstraints=critical,CA:false" \
    2>/dev/null

echo "▶ Bundling into PKCS#12…"
openssl pkcs12 -export -legacy \
    -inkey "$TMPDIR/key.pem" \
    -in "$TMPDIR/cert.pem" \
    -out "$TMPDIR/bundle.p12" \
    -name "$CERT_NAME" \
    -passout "pass:$PASS" \
    2>/dev/null

echo "▶ Importing into login keychain…"
security import "$TMPDIR/bundle.p12" \
    -k "$HOME/Library/Keychains/login.keychain-db" \
    -P "$PASS" \
    -A \
    -t cert \
    -f pkcs12 \
    2>/dev/null

echo "▶ Verifying…"
if security find-identity -v -p codesigning | grep -q "$CERT_NAME"; then
    echo ""
    echo "✓ Done. Identity installed:"
    security find-identity -v -p codesigning | grep "$CERT_NAME"
    echo ""
    echo "Next: rerun ./run-dev.sh — it will pick up the new identity"
    echo "automatically. First launch asks for Keychain access; click"
    echo "'Always Allow' and subsequent runs won't prompt."
else
    echo "✘ Import failed — identity not found after install."
    exit 1
fi
