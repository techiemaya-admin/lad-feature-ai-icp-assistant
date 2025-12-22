#!/bin/bash

##############################################################################
# AI-ICP-Assistant Feature: Merge to LAD-Frontend
#
# This script merges the ai-icp-assistant SDK from the isolated repository
# into the LAD-Frontend main repository.
#
# USAGE:
#   ./scripts/merge-to-frontend.sh
#
# REQUIREMENTS:
#   - lad-feature-ai-icp-assistant repo at ~/Desktop/AI-Maya/lad-feature-ai-icp-assistant
#   - LAD repo at ~/Desktop/AI-Maya/LAD (contains frontend/)
#   - Git credentials configured
##############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting AI-ICP-Assistant Frontend Merge${NC}"
echo "================================================"

# Step 1: Verify directories exist
FEATURE_REPO="$HOME/Desktop/AI-Maya/lad-feature-ai-icp-assistant"
FRONTEND_REPO="$HOME/Desktop/AI-Maya/LAD/frontend"

if [ ! -d "$FEATURE_REPO" ]; then
  echo -e "${RED}❌ Feature repo not found at: $FEATURE_REPO${NC}"
  exit 1
fi

if [ ! -d "$FRONTEND_REPO" ]; then
  echo -e "${RED}❌ Frontend repo not found at: $FRONTEND_REPO${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Repositories found${NC}"

# Step 2: Navigate to feature repo and get latest
echo -e "\n${YELLOW}📥 Fetching latest from feature repo...${NC}"
cd "$FEATURE_REPO"
git checkout main
git pull origin main

FEATURE_COMMIT=$(git rev-parse --short HEAD)
echo -e "${GREEN}✅ Feature repo at commit: $FEATURE_COMMIT${NC}"

# Step 3: Navigate to LAD-Frontend
echo -e "\n${YELLOW}📥 Preparing LAD-Frontend...${NC}"
cd "$FRONTEND_REPO"

# Ensure we're on develop and up to date
git checkout develop
git pull origin develop

# Create a feature branch
BRANCH_NAME="feature/ai-icp-assistant-sdk-update-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$BRANCH_NAME"

echo -e "${GREEN}✅ Created branch: $BRANCH_NAME${NC}"

# Step 4: Backup current SDK files
echo -e "\n${YELLOW}💾 Creating backup...${NC}"
BACKUP_DIR="/tmp/ai-icp-assistant-frontend-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r sdk/features/ai-icp-assistant/* "$BACKUP_DIR/" || true

echo -e "${GREEN}✅ Backup created at: $BACKUP_DIR${NC}"

# Step 5: Remove old SDK files
echo -e "\n${YELLOW}🗑️  Removing old SDK files...${NC}"
rm -rf sdk/features/ai-icp-assistant/*

# Step 6: Copy new SDK files
echo -e "\n${YELLOW}📋 Copying new SDK files from feature repo...${NC}"

# Ensure target directory exists
mkdir -p sdk/features/ai-icp-assistant

# Copy SDK files
if [ -d "$FEATURE_REPO/frontend/sdk" ]; then
  cp -r "$FEATURE_REPO/frontend/sdk"/* sdk/features/ai-icp-assistant/
  echo -e "${GREEN}✅ Copied SDK files${NC}"
fi

# Step 7: Handle component files if they exist
if [ -d "$FEATURE_REPO/frontend/components" ] && [ "$(ls -A $FEATURE_REPO/frontend/components)" ]; then
  echo -e "\n${YELLOW}📋 Copying component files...${NC}"
  
  # Ensure target directory exists
  mkdir -p web/src/features/ai-icp-assistant
  
  # Backup components
  if [ -d "web/src/features/ai-icp-assistant" ]; then
    cp -r web/src/features/ai-icp-assistant/* "$BACKUP_DIR/components/" || true
  fi
  
  # Remove old components
  rm -rf web/src/features/ai-icp-assistant/*
  
  # Copy new components
  cp -r "$FEATURE_REPO/frontend/components"/* web/src/features/ai-icp-assistant/
  echo -e "${GREEN}✅ Copied component files${NC}"
fi

# Step 8: Show changes
echo -e "\n${YELLOW}📊 Changes summary:${NC}"
git status --short

echo -e "\n${YELLOW}🔍 Detailed diff:${NC}"
git diff --stat

# Step 9: Ask for confirmation
echo -e "\n${YELLOW}❓ Do you want to commit these changes? (y/n)${NC}"
read -r response

if [[ "$response" != "y" ]]; then
  echo -e "${RED}❌ Merge cancelled. Branch preserved for manual review.${NC}"
  echo -e "${YELLOW}To restore backup: cp -r $BACKUP_DIR/* sdk/features/ai-icp-assistant/${NC}"
  exit 0
fi

# Step 10: Commit changes
echo -e "\n${YELLOW}💾 Committing changes...${NC}"
git add sdk/features/ai-icp-assistant/
if [ -d "web/src/features/ai-icp-assistant" ]; then
  git add web/src/features/ai-icp-assistant/
fi

COMMIT_MSG="feat(ai-icp-assistant): merge SDK updates from feature repo

Synced from commit: $FEATURE_COMMIT
Repository: lad-feature-ai-icp-assistant

Changes include:
- Updated SDK services and types
- Enhanced TypeScript definitions
- Latest improvements and bug fixes

Backup available at: $BACKUP_DIR"

git commit -m "$COMMIT_MSG"

echo -e "${GREEN}✅ Changes committed${NC}"

# Step 11: Push to remote
echo -e "\n${YELLOW}📤 Push to remote? (y/n)${NC}"
read -r push_response

if [[ "$push_response" == "y" ]]; then
  git push origin "$BRANCH_NAME"
  echo -e "${GREEN}✅ Pushed to remote: $BRANCH_NAME${NC}"
  echo -e "\n${GREEN}🎉 Frontend merge complete!${NC}"
  echo -e "${YELLOW}Next steps:${NC}"
  echo "1. Create a PR on GitHub: https://github.com/techiemaya-admin/LAD-Frontend/compare/$BRANCH_NAME"
  echo "2. Request code review"
  echo "3. Run tests: cd web && npm run build && npm test"
  echo "4. Merge PR to develop"
else
  echo -e "${YELLOW}⚠️  Changes committed locally but not pushed${NC}"
  echo -e "To push later: git push origin $BRANCH_NAME"
fi

# Cleanup suggestion
echo -e "\n${YELLOW}💡 Backup location: $BACKUP_DIR${NC}"
echo -e "Delete backup after successful merge: rm -rf $BACKUP_DIR"

echo -e "\n${GREEN}================================================${NC}"
echo -e "${GREEN}✅ Script completed successfully${NC}"
