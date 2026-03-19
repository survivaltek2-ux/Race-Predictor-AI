#!/bin/bash

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✓ $1${NC}"; }
log_error() { echo -e "${RED}✗ $1${NC}"; }

cleanup() {
  log_info "Shutting down services..."
  kill $API_PID 2>/dev/null || true
  kill $FRONTEND_PID 2>/dev/null || true
  exit 0
}

trap cleanup SIGINT SIGTERM

echo -e "${YELLOW}╔════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  Race Predictor AI - Development Mode  ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════╝${NC}"

# Load environment
if [ ! -f ".env.local" ]; then
  log_error ".env.local not found"
  log_info "Run: bash scripts/setup-env.sh"
  exit 1
fi

export $(cat .env.local | grep -v '^#' | xargs)

log_success "Environment loaded"
echo ""

# Start API Server
log_info "🚀 Starting API Server (port $PORT)..."
pnpm --filter @workspace/api-server run dev 2>&1 | sed 's/^/[API] /' &
API_PID=$!

sleep 4

# Start Frontend
log_info "🚀 Starting Frontend (port 5173)..."
pnpm --filter @workspace/horse-racing-ai run dev 2>&1 | sed 's/^/[WEB] /' &
FRONTEND_PID=$!

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
log_success "All services running!"
echo ""
echo -e "${BLUE}Access the application:${NC}"
echo -e "  ${YELLOW}Frontend:${NC}    http://localhost:5173"
echo -e "  ${YELLOW}API:${NC}         http://localhost:$PORT/api"
echo -e "  ${YELLOW}Health Check:${NC} http://localhost:$PORT/api/health"
echo ""
log_warn "Press Ctrl+C to stop all services"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""

wait