#!/bin/bash

# Colors for output
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo -e "${YELLOW}⚙️  Race Predictor AI - Environment Setup${NC}"
echo "=========================================="

# Create .env.local if it doesn't exist
if [ ! -f ".env.local" ]; then
  touch .env.local
  echo -e "${GREEN}✓ Created .env.local${NC}"
fi

# Prompt for database URL
read -p "Enter PostgreSQL connection URL (postgresql://user:password@localhost:5432/race_predictor): " DB_URL
DB_URL=${DB_URL:-postgresql://postgres:postgres@localhost:5432/race_predictor}

# Prompt for API key
read -p "Enter ODDS_API_KEY (default: f790059e4bf2b597eeb7b630d60fc8cd): " ODDS_KEY
ODDS_KEY=${ODDS_KEY:-f790059e4bf2b597eeb7b630d60fc8cd}

# Prompt for port
read -p "Enter PORT (default: 3000): " PORT
PORT=${PORT:-3000}

# Write to .env.local
cat > .env.local << EOF
# Database Configuration
DATABASE_URL=$DB_URL

# Server Configuration
PORT=$PORT
NODE_ENV=development

# External APIs
ODDS_API_KEY=$ODDS_KEY
EOF

echo -e "${GREEN}✓ Environment configuration saved to .env.local${NC}"
echo -e "${YELLOW}📝 Next steps:${NC}"
echo -e "   1. Ensure PostgreSQL is running"
echo -e "   2. Run: bash scripts/deploy-local.sh"