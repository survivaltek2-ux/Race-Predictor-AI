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

# Check environment file
if [ ! -f ".env.local" ]; then
  log_warn ".env.local not found. Creating template..."
  cat > .env.local << 'EOF'
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/race_predictor
PORT=3000
NODE_ENV=development
ODDS_API_KEY=f790059e4bf2b597eeb7b630d60fc8cd
EOF
  log_info "Created .env.local - please update with your settings"
fi

# Load env variables
export $(cat .env.local | grep -v '^#' | xargs)

# Install dependencies with pnpm
log_info "Installing dependencies with pnpm..."
pnpm install --frozen-lockfile || {
  log_warn "Installation failed, trying with --no-frozen-lockfile..."
  pnpm install
}
log_success "Dependencies installed"

# Setup database
log_info "Setting up PostgreSQL database..."
if ! psql -lqt | cut -d \| -f 1 | grep -qw race_predictor; then
  log_info "Creating database 'race_predictor'..."
  createdb race_predictor || log_warn "Database may already exist"
fi

log_info "Running database migrations..."
pnpm --filter @workspace/db run push 2>/dev/null || {
  log_warn "Migration failed, attempting force push..."
  pnpm --filter @workspace/db run push-force || log_error "Database setup failed"
}
log_success "Database setup complete"

# Start development server
log_success "Starting development server on port $PORT"
log_info "API will be available at http://localhost:$PORT/api"
log_info "Health check: http://localhost:$PORT/api/health"

PORT=$PORT NODE_ENV=development pnpm --filter @workspace/api-server run dev