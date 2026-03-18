#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🚀 Race Predictor AI - Production Deployment${NC}"
echo "=========================================="

# Check environment
if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}❌ DATABASE_URL environment variable not set${NC}"
  exit 1
fi

if [ -z "$PORT" ]; then
  echo -e "${YELLOW}⚠️  PORT not set, using default 3000${NC}"
  PORT=3000
fi

# Type check
echo -e "${YELLOW}✓ Running type checks...${NC}"
pnpm run typecheck
echo -e "${GREEN}✓ Type checks passed${NC}"

# Build
echo -e "${YELLOW}🔨 Building production bundle...${NC}"
pnpm run build
echo -e "${GREEN}✓ Build complete${NC}"

# Verify bundle
if [ ! -f "artifacts/api-server/dist/index.cjs" ]; then
  echo -e "${RED}❌ Production bundle not found!${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Bundle verified${NC}"

# Start production server
echo -e "${YELLOW}🚀 Starting production server...${NC}"
echo -e "${GREEN}✓ Server running on port ${PORT}${NC}"

NODE_ENV=production PORT=${PORT} node artifacts/api-server/dist/index.cjs