#!/bin/bash

set -e

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✓ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}✗ $1${NC}"; exit 1; }

echo -e "${YELLOW}╔════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  PostgreSQL Setup for Development      ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════╝${NC}"

# Check if PostgreSQL is installed
if ! command -v psql &>/dev/null; then
  log_error "PostgreSQL not installed. Install with:"
  echo "  macOS: brew install postgresql@16"
  echo "  Ubuntu/Debian: sudo apt-get install postgresql postgresql-contrib"
  echo "  Windows: Download from https://www.postgresql.org/download/"
fi

log_info "Checking PostgreSQL status..."

# Start PostgreSQL if not running
if ! pg_isready -h localhost -p 5432 &>/dev/null; then
  log_warn "PostgreSQL not running. Attempting to start..."
  
  # Try different start methods based on OS
  if command -v brew &>/dev/null; then
    brew services start postgresql@16 || log_warn "Could not start via brew"
  elif command -v systemctl &>/dev/null; then
    sudo systemctl start postgresql || log_warn "Could not start via systemctl"
  else
    log_warn "Could not detect how to start PostgreSQL. Please start it manually."
  fi
  
  # Wait for PostgreSQL to be ready
  sleep 2
fi

# Verify connection
if ! pg_isready -h localhost -p 5432 &>/dev/null; then
  log_error "PostgreSQL is not accessible on localhost:5432"
fi
log_success "PostgreSQL is running"

# Get PostgreSQL superuser (usually 'postgres')
log_info "Checking PostgreSQL users..."
PG_USER="postgres"

# Try to connect as postgres user
if ! psql -U "$PG_USER" -tc "SELECT 1" &>/dev/null 2>&1; then
  log_warn "Cannot connect as '$PG_USER', checking current OS user..."
  CURRENT_USER=$(whoami)
  
  # On some systems, PostgreSQL creates a role matching the OS user
  if psql -U "$CURRENT_USER" -tc "SELECT 1" &>/dev/null 2>&1; then
    PG_USER="$CURRENT_USER"
    log_success "Using PostgreSQL user: $PG_USER"
  else
    log_error "Cannot connect to PostgreSQL with default users. Please set DATABASE_URL manually."
  fi
fi

log_success "PostgreSQL user found: $PG_USER"

# Create database
log_info "Creating 'race_predictor' database..."
createdb -U "$PG_USER" race_predictor 2>/dev/null || log_info "Database 'race_predictor' already exists"
log_success "Database ready"

# Build connection string
DB_URL="postgresql://$PG_USER@localhost:5432/race_predictor"
log_success "Database URL: $DB_URL"

# Update or create .env.local
if [ ! -f ".env.local" ]; then
  log_info "Creating .env.local..."
  cat > .env.local << EOF
DATABASE_URL=$DB_URL
PORT=3000
NODE_ENV=development
ODDS_API_KEY=f790059e4bf2b597eeb7b630d60fc8cd
AI_INTEGRATIONS_OPENAI_BASE_URL=http://localhost:8000
AI_INTEGRATIONS_OPENAI_API_KEY=sk-local-dev-key-placeholder
EOF
else
  log_info "Updating .env.local..."
  sed -i.bak "s|DATABASE_URL=.*|DATABASE_URL=$DB_URL|" .env.local
  log_info "Backed up to .env.local.bak"
fi

log_success "PostgreSQL setup complete!"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo -e "  1. Review .env.local and update if needed"
echo -e "  2. Run: ${YELLOW}bash scripts/deploy-local.sh${NC}"