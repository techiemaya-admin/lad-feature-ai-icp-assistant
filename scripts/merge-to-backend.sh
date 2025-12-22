#!/bin/bash

##############################################################################
# AI-ICP-Assistant Feature: Merge to LAD-Backend
#
# This script merges the ai-icp-assistant feature from the isolated repository
# into the LAD-Backend main repository.
#
# USAGE:
#   ./scripts/merge-to-backend.sh
#
# REQUIREMENTS:
#   - lad-feature-ai-icp-assistant repo at ~/Desktop/AI-Maya/lad-feature-ai-icp-assistant
#   - LAD-Backend repo at ~/Desktop/AI-Maya/LAD-Backend
#   - Git credentials configured
##############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting AI-ICP-Assistant Backend Merge${NC}"
echo "================================================"

# Step 1: Verify directories exist
FEATURE_REPO="$HOME/Desktop/AI-Maya/lad-feature-ai-icp-assistant"
BACKEND_REPO="$HOME/Desktop/AI-Maya/LAD-Backend"

if [ ! -d "$FEATURE_REPO" ]; then
  echo -e "${RED}❌ Feature repo not found at: $FEATURE_REPO${NC}"
  exit 1
fi

if [ ! -d "$BACKEND_REPO" ]; then
  echo -e "${RED}❌ Backend repo not found at: $BACKEND_REPO${NC}"
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

# Step 3: Navigate to LAD-Backend
echo -e "\n${YELLOW}📥 Preparing LAD-Backend...${NC}"
cd "$BACKEND_REPO"

# Ensure we're on develop and up to date
git checkout develop
git pull origin develop

# Create a feature branch
BRANCH_NAME="feature/ai-icp-assistant-update-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$BRANCH_NAME"

echo -e "${GREEN}✅ Created branch: $BRANCH_NAME${NC}"

# Step 4: Backup current feature files
echo -e "\n${YELLOW}💾 Creating backup...${NC}"
BACKUP_DIR="/tmp/ai-icp-assistant-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r features/ai-icp-assistant/* "$BACKUP_DIR/" || true

echo -e "${GREEN}✅ Backup created at: $BACKUP_DIR${NC}"

# Step 5: Remove old files
echo -e "\n${YELLOW}🗑️  Removing old files...${NC}"
rm -rf features/ai-icp-assistant/services/*
rm -rf features/ai-icp-assistant/routes/*
rm -f features/ai-icp-assistant/manifest.js
rm -f features/ai-icp-assistant/UPGRADE_NOTES.md

# Step 6: Copy new files
echo -e "\n${YELLOW}📋 Copying new files from feature repo...${NC}"

# Ensure target directories exist
mkdir -p features/ai-icp-assistant/services
mkdir -p features/ai-icp-assistant/routes

# Copy services
if [ -d "$FEATURE_REPO/backend/services" ]; then
  cp -r "$FEATURE_REPO/backend/services"/* features/ai-icp-assistant/services/
  echo -e "${GREEN}✅ Copied services${NC}"
fi

# Copy routes
if [ -f "$FEATURE_REPO/backend/routes/routes.js" ]; then
  cp "$FEATURE_REPO/backend/routes/routes.js" features/ai-icp-assistant/routes.js
  echo -e "${GREEN}✅ Copied routes${NC}"
fi

# Copy manifest
if [ -f "$FEATURE_REPO/backend/manifest.js" ]; then
  cp "$FEATURE_REPO/backend/manifest.js" features/ai-icp-assistant/
  echo -e "${GREEN}✅ Copied manifest${NC}"
fi

# Copy upgrade notes
if [ -f "$FEATURE_REPO/backend/UPGRADE_NOTES.md" ]; then
  cp "$FEATURE_REPO/backend/UPGRADE_NOTES.md" features/ai-icp-assistant/
  echo -e "${GREEN}✅ Copied upgrade notes${NC}"
fi

# Step 7: Show changes
echo -e "\n${YELLOW}📊 Changes summary:${NC}"
git status --short

echo -e "\n${YELLOW}🔍 Detailed diff:${NC}"
git diff --stat

# Step 8: Ask for confirmation
echo -e "\n${YELLOW}❓ Do you want to commit these changes? (y/n)${NC}"
read -r response

if [[ "$response" != "y" ]]; then
  echo -e "${RED}❌ Merge cancelled. Branch preserved for manual review.${NC}"
  echo -e "${YELLOW}To restore backup: cp -r $BACKUP_DIR/* features/ai-icp-assistant/${NC}"
  exit 0
fi

# Step 9: Commit changes
echo -e "\n${YELLOW}💾 Committing changes...${NC}"
git add features/ai-icp-assistant/

COMMIT_MSG="feat(ai-icp-assistant): merge updates from feature repo

Synced from commit: $FEATURE_COMMIT
Repository: lad-feature-ai-icp-assistant

Changes include:
- Updated services and routes
- Enhanced AI capabilities
- Latest bug fixes and improvements

Backup available at: $BACKUP_DIR"

git commit -m "$COMMIT_MSG"

echo -e "${GREEN}✅ Changes committed${NC}"

# Step 10: Push to remote
echo -e "\n${YELLOW}📤 Push to remote? (y/n)${NC}"
read -r push_response

if [[ "$push_response" == "y" ]]; then
  git push origin "$BRANCH_NAME"
  echo -e "${GREEN}✅ Pushed to remote: $BRANCH_NAME${NC}"
  echo -e "\n${GREEN}🎉 Backend merge complete!${NC}"
  echo -e "${YELLOW}Next steps:${NC}"
  echo "1. Create a PR on GitHub: https://github.com/techiemaya-admin/LAD-Backend/compare/$BRANCH_NAME"
  echo "2. Request code review"
  echo "3. Run tests: npm test"
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
