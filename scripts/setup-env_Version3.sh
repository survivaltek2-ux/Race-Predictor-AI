#!/bin/bash

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Environment Configuration Setup       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"

# Defaults
DEFAULT_DB="postgresql://postgres@localhost:5432/race_predictor"
DEFAULT_ODDS_KEY="f790059e4bf2b597eeb7b630d60fc8cd"
DEFAULT_PORT="3000"
DEFAULT_OPENAI_URL="http://localhost:8000"
DEFAULT_OPENAI_KEY="sk-local-dev-key-placeholder"

# Prompt with defaults
echo -e "${YELLOW}Database Configuration:${NC}"
read -p "PostgreSQL URL [$DEFAULT_DB]: " DB_URL
DB_URL="${DB_URL:-$DEFAULT_DB}"

echo ""
echo -e "${YELLOW}Server Configuration:${NC}"
read -p "API Port [$DEFAULT_PORT]: " PORT
PORT="${PORT:-$DEFAULT_PORT}"

echo ""
echo -e "${YELLOW}External APIs:${NC}"
read -p "ODDS_API_KEY [$DEFAULT_ODDS_KEY]: " ODDS_KEY
ODDS_KEY="${ODDS_KEY:-$DEFAULT_ODDS_KEY}"

echo ""
echo -e "${YELLOW}OpenAI Integration (for local dev, use defaults):${NC}"
read -p "AI_INTEGRATIONS_OPENAI_BASE_URL [$DEFAULT_OPENAI_URL]: " OPENAI_URL
OPENAI_URL="${OPENAI_URL:-$DEFAULT_OPENAI_URL}"

read -p "AI_INTEGRATIONS_OPENAI_API_KEY [$DEFAULT_OPENAI_KEY]: " OPENAI_KEY
OPENAI_KEY="${OPENAI_KEY:-$DEFAULT_OPENAI_KEY}"

# Write configuration
cat > .env.local << EOF
# Database Configuration
DATABASE_URL=$DB_URL

# Server Configuration
PORT=$PORT
NODE_ENV=development

# External APIs
ODDS_API_KEY=$ODDS_KEY

# OpenAI Integration
AI_INTEGRATIONS_OPENAI_BASE_URL=$OPENAI_URL
AI_INTEGRATIONS_OPENAI_API_KEY=$OPENAI_KEY
EOF

echo ""
echo -e "${GREEN}✓ Configuration saved to .env.local${NC}"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo -e "  For PostgreSQL setup: ${YELLOW}bash scripts/setup-postgres.sh${NC}"
echo -e "  To start development: ${YELLOW}bash scripts/deploy-local.sh${NC}"