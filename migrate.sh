#!/usr/bin/env bash
# Supabase single-command database migration script (Git Bash)
export PATH="/c/Program Files/nodejs:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$SCRIPT_DIR/scripts/migrate.js" ]; then
  node "$SCRIPT_DIR/scripts/migrate.js" "$@"
elif [ -f "$SCRIPT_DIR/backend/scripts/migrate.js" ]; then
  node "$SCRIPT_DIR/backend/scripts/migrate.js" "$@"
else
  node backend/scripts/migrate.js "$@"
fi
