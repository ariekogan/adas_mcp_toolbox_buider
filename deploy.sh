#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Skill Builder Deploy Script
#
# This is the ONE AND ONLY way to deploy the Skill Builder.
# It runs INSIDE the ai-dev-assistant compose — NOT standalone.
# ═══════════════════════════════════════════════════════════════

set -e

MAC1="mac1"
CORE_PROJECT="/Users/ariekogan333/Projects/ai-dev-assistant"
BUILDER_PROJECT="/Users/ariekogan333/Projects/adas_mcp_toolbox_builder"
BRANCH="${1:-main}"

echo "══════════════════════════════════════"
echo "  Skill Builder Deploy"
echo "══════════════════════════════════════"

# Step 1: Push code
echo ""
echo "→ Pushing to origin/$BRANCH..."
git push origin "$BRANCH" 2>/dev/null || git push origin "$BRANCH"

# Step 2: Pull on mac1
echo "→ Pulling on mac1..."
ssh $MAC1 "cd $BUILDER_PROJECT && git fetch origin && git checkout $BRANCH && git reset --hard origin/$BRANCH"

# Step 3: Build & restart via ADAS Core compose (the ONLY correct way)
echo "→ Building & restarting via ai-dev-assistant compose..."
ssh $MAC1 "export PATH=/usr/local/bin:/opt/homebrew/bin:\$PATH && cd $CORE_PROJECT && docker compose up -d --build skill-builder-backend skill-builder-frontend"

# Step 4: Verify
echo ""
echo "→ Verifying..."
sleep 3
ssh $MAC1 "export PATH=/usr/local/bin:/opt/homebrew/bin:\$PATH && docker ps --format 'table {{.Names}}\t{{.Status}}' | grep skill-builder"

echo ""
echo "══════════════════════════════════════"
echo "  ✓ Deploy complete"
echo "══════════════════════════════════════"
echo ""
echo "  builder.ateam-ai.com  → Skill Builder UI"
echo "  app.ateam-ai.com      → Full platform"
echo ""
