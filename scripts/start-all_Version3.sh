#!/bin/bash

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✓ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }

echo -e "${YELLOW}╔════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  Race Predictor AI - Full Stack Start  ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════╝${NC}"

# Load env variables
if [ ! -f ".env.local" ]; then
  log_warn "No .env.local found. Creating default..."
  bash scripts/setup-env.sh
fi

export $(cat .env.local | grep -v '^#' | xargs)

log_info "Starting both API server and frontend..."
log_success "API Server: http://localhost:$PORT/api"
log_success "Frontend: http://localhost:5173"
log_warn "Press Ctrl+C to stop all services"
log_info ""

# Start API server in background
log_info "Starting API server on port $PORT..."
pnpm --filter @workspace/api-server run dev &
API_PID=$!

# Give API server time to start
sleep 3

# Start frontend in background
log_info "Starting frontend on port 5173..."
pnpm --filter @workspace/horse-racing-ai run dev &
FRONTEND_PID=$!

# Wait for both processes
wait $API_PID $FRONTEND_PID