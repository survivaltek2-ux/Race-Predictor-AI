#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL environment variable is required"
  exit 1
fi

if [ -z "$ODDS_API_KEY" ]; then
  echo "WARNING: ODDS_API_KEY not set — sports odds features will not work"
fi

if [ -n "$OPENAI_API_KEY" ] && [ -z "$AI_INTEGRATIONS_OPENAI_API_KEY" ]; then
  export AI_INTEGRATIONS_OPENAI_API_KEY="$OPENAI_API_KEY"
  export AI_INTEGRATIONS_OPENAI_BASE_URL="${AI_INTEGRATIONS_OPENAI_BASE_URL:-https://api.openai.com/v1}"
fi

if [ -z "$AI_INTEGRATIONS_OPENAI_API_KEY" ] || [ -z "$AI_INTEGRATIONS_OPENAI_BASE_URL" ]; then
  echo "WARNING: OpenAI env vars not set — AI predictions will not work"
  echo "  Set OPENAI_API_KEY or both AI_INTEGRATIONS_OPENAI_API_KEY and AI_INTEGRATIONS_OPENAI_BASE_URL"
fi

echo "Pushing database schema..."
cd /app
if ! pnpm --filter @workspace/db run push 2>&1; then
  echo "WARNING: drizzle-kit push failed — retrying with --force..."
  pnpm --filter @workspace/db run push-force 2>&1 || echo "WARNING: DB push-force also failed — tables may already exist"
fi

export DOCKER=true
echo "Starting server on port ${PORT:-8080}..."
exec node /app/artifacts/api-server/dist/index.cjs
