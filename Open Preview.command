#!/bin/sh
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  osascript -e 'display alert "Node.js 20 or newer is required. Install it, then open this launcher again."'
  exit 1
fi
PWA_DEBUG_URL=$(osascript -e 'text returned of (display dialog "PWA URL to preview:" default answer "https://example.com/" buttons {"Cancel", "Open"} default button "Open")')
exec node src/cli.mjs --url "$PWA_DEBUG_URL"
