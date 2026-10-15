#!/usr/bin/env bash
# Quick start script for Git Bash from project root
export PATH="/c/Program Files/nodejs:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$SCRIPT_DIR/server.js" ]; then
  # Running from inside backend/
  node server.js
elif [ -d "$SCRIPT_DIR/backend" ]; then
  # Running from root directory
  cd "$SCRIPT_DIR/backend" || exit 1
  node server.js
else
  node server.js
fi
