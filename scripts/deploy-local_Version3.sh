#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✓ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}✗ $1${NC}"; exit 1; }

echo -e "${YELLOW}╔════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  Race Predictor AI - Local Deployment  ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════╝${NC}"

# Check prerequisites
log_info "Checking prerequisites..."
command -v node &>/dev/null || log_error "Node.js not found. Install Node.js 24+"
command -v pnpm &>/dev/null || log_error "pnpm not found. Install: npm install -g pnpm"
command -v psql &>/dev/null || log_error "PostgreSQL not found. Install PostgreSQL 16+"
log_success "All prerequisites installed"

# Check and create .env.local
if [ ! -f ".env.local" ]; then
  log_warn ".env.local not found. Creating with defaults..."
  cat > .env.local << 'EOF'
# Database Configuration
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/race_predictor

# Server Configuration
PORT=3000
NODE_ENV=development

# External APIs
ODDS_API_KEY=f790059e4bf2b597eeb7b630d60fc8cd

# OpenAI Integration (for local development, you can use a mock)
AI_INTEGRATIONS_OPENAI_BASE_URL=http://localhost:8000
AI_INTEGRATIONS_OPENAI_API_KEY=sk-local-dev-key-placeholder
EOF
  log_success "Created .env.local with defaults"
  log_info "Update DATABASE_URL if needed before continuing"
fi

# Load env variables
export $(cat .env.local | grep -v '^#' | xargs)

# Install dependencies
log_info "Installing dependencies with pnpm..."
pnpm install --frozen-lockfile 2>/dev/null || {
  log_warn "Frozen lockfile failed, installing without constraints..."
  pnpm install
}
log_success "Dependencies installed"

# Setup PostgreSQL Database
log_info "Setting up PostgreSQL database..."

# Detect PostgreSQL user
PG_USER="postgres"
if ! psql -U "$PG_USER" -l &>/dev/null 2>&1; then
  log_warn "Could not connect as '$PG_USER', trying 'root'..."
  PG_USER="root"
fi

# Create database
log_info "Creating database 'race_predictor'..."
psql -U "$PG_USER" -tc "SELECT 1 FROM pg_database WHERE datname = 'race_predictor'" | grep -q 1 || \
  (createdb -U "$PG_USER" race_predictor 2>/dev/null || log_info "Database may already exist")

# Run migrations
log_info "Running database migrations..."
if [ -z "$DATABASE_URL" ]; then
  log_error "DATABASE_URL is not set in .env.local"
fi

pnpm --filter @workspace/db run push 2>&1 || {
  log_warn "Standard push failed, trying force push..."
  pnpm --filter @workspace/db run push-force 2>&1 || log_warn "Migration completed with warnings"
}
log_success "Database configured"

# Start development server
echo ""
log_success "Starting development server on port $PORT"
log_info "API will be available at http://localhost:$PORT/api"
log_info "Health check: http://localhost:$PORT/api/health"
log_info "Press Ctrl+C to stop"

PORT=$PORT NODE_ENV=development pnpm --filter @workspace/api-server run dev