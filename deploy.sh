#!/usr/bin/env bash
# Deploy easydoes to easydoes.ai: secrets from the macOS keychain first (a secrets-only change doesn't restart the
# Durable Object; the deploy after it does), the D1 schema (idempotent), then the build and deploy.
set -euo pipefail
cd "$(dirname "$0")"
export CLOUDFLARE_ACCOUNT_ID=6d4b74aeb10f455fbf88141901e7595d
key() { security find-generic-password -s "$1" -w 2>/dev/null; }
ensure() { key "$1" >/dev/null || security add-generic-password -s "$1" -a easydoes -w "$(openssl rand -hex 32)"; }
ensure easydoes-session-pepper
ensure easydoes-agent-token
ensure easydoes-notify-secret
secrets=$(mktemp)
trap 'rm -f "$secrets"' EXIT
{
  printf 'SENDBLUE_FROM=%s\n' "$(key easydoes-sendblue-from)"
  printf 'SENDBLUE_API_KEY=%s\n' "$(key raea-admin-sendblue-key-id)"
  printf 'SENDBLUE_API_SECRET=%s\n' "$(key raea-admin-sendblue-secret)"
  printf 'SESSION_PEPPER=%s\n' "$(key easydoes-session-pepper)"
  printf 'AGENT_TOKEN=%s\n' "$(key easydoes-agent-token)"
  printf 'NOTIFY_SECRET=%s\n' "$(key easydoes-notify-secret)"
  [ -n "${NOTIFY_URL:-}" ] && printf 'NOTIFY_URL=%s\n' "$NOTIFY_URL"
} > "$secrets"
npx wrangler d1 execute easydoes --remote --file worker/schema.sql >/dev/null
npm run build
npx wrangler deploy --secrets-file "$secrets"
