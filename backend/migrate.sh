#!/usr/bin/env bash
# Supabase single-command database migration script from backend directory
export PATH="/c/Program Files/nodejs:$PATH"

node scripts/migrate.js "$@"
