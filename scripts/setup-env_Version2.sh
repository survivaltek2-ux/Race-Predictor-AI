#!/bin/bash

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Environment Configuration Setup       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"

# Defaults
DEFAULT_DB="postgresql://postgres:postgres@localhost:5432/race_predictor"
DEFAULT_ODDS_KEY="f790059e4bf2b597eeb7b630d60fc8cd"
DEFAULT_PORT="3000"

# Prompt with defaults
read -p "$(echo -e ${YELLOW})PostgreSQL URL ($DEFAULT_DB): $(echo -e ${NC})" DB_URL
DB_URL="${DB_URL:-$DEFAULT_DB}"

read -p "$(echo -e ${YELLOW})ODDS_API_KEY ($DEFAULT_ODDS_KEY): $(echo -e ${NC})" ODDS_KEY
ODDS_KEY="${ODDS_KEY:-$DEFAULT_ODDS_KEY}"

read -p "$(echo -e ${YELLOW})API Port ($DEFAULT_PORT): $(echo -e ${NC})" PORT
PORT="${PORT:-$DEFAULT_PORT}"

# Write configuration
cat > .env.local << EOF
# Database Configuration
DATABASE_URL=$DB_URL

# Server Configuration
PORT=$PORT
NODE_ENV=development

# External APIs
ODDS_API_KEY=$ODDS_KEY
EOF

echo -e "${GREEN}✓ Configuration saved to .env.local${NC}"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo -e "  1. Ensure PostgreSQL is running"
echo -e "  2. Run: ${YELLOW}bash scripts/deploy-local.sh${NC}"