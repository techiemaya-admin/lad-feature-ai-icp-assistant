#!/bin/bash
set -e

# Store original directory
ORIGINAL_DIR=$(pwd)

echo "🚀 Manual Sync to LAD Repositories"
echo "=================================="

# Check if LAD_REPO_TOKEN is set
if [ -z "$LAD_REPO_TOKEN" ]; then
  echo "❌ Error: LAD_REPO_TOKEN environment variable is not set"
  echo "Please set it with: export LAD_REPO_TOKEN='your-token-here'"
  exit 1
fi

echo "✅ LAD_REPO_TOKEN is set"

# Clone LAD-Backend
echo ""
echo "📦 Syncing to LAD-Backend..."
rm -rf /tmp/lad-backend
git clone --depth=1 --branch=develop "https://oauth2:${LAD_REPO_TOKEN}@github.com/techiemaya-admin/LAD-Backend.git" /tmp/lad-backend

# Copy backend files
echo "📝 Copying backend files..."
rsync -av \
  --exclude='.env*' \
  --exclude='*.local.js' \
  --exclude='node_modules/' \
  --exclude='.DS_Store' \
  backend/features/ai-icp-assistant/ /tmp/lad-backend/features/ai-icp-assistant/

# Verify critical files
echo "🔍 Verifying critical files..."
cd /tmp/lad-backend
if [ ! -f "features/ai-icp-assistant/manifest.js" ]; then
  echo "❌ Critical file missing: manifest.js"
  exit 1
fi
echo "✅ All critical files present"

# Commit and push
echo "💾 Committing changes..."
git config user.name "Manual Sync"
git config user.email "sync@local"
git add features/ai-icp-assistant/
if git diff --staged --quiet; then
  echo "ℹ️ No changes to commit to LAD-Backend"
else
  git commit -m "feat(ai-icp-assistant): manual sync - LAD architecture compliance

- Repository layer with tenant isolation
- Tenant validation middleware
- Updated controllers and services
- Database migrations for LAD compliance

Synced manually from local workspace"
  
  echo "📤 Pushing to LAD-Backend/develop..."
  git push origin develop
  echo "✅ LAD-Backend sync complete!"
fi

# Return to original directory
cd "$ORIGINAL_DIR"

# Clone LAD-Frontend
echo ""
echo "📦 Syncing to LAD-Frontend..."
rm -rf /tmp/lad-frontend
git clone --depth=1 --branch=develop "https://oauth2:${LAD_REPO_TOKEN}@github.com/techiemaya-admin/LAD-Frontend.git" /tmp/lad-frontend

# Copy frontend SDK files
echo "📍 Current directory: $(pwd)"
echo "🔍 Checking for frontend/sdk/features/ai-icp-assistant..."
if [ -d "frontend/sdk/features/ai-icp-assistant" ]; then
  echo "✅ Found frontend SDK directory"
  echo "📝 Copying frontend SDK files..."
  mkdir -p /tmp/lad-frontend/sdk/features/ai-icp-assistant
  rsync -av \
    --exclude='node_modules/' \
    --exclude='.DS_Store' \
    --exclude='*.test.ts' \
    --exclude='*.test.tsx' \
    frontend/sdk/features/ai-icp-assistant/ /tmp/lad-frontend/sdk/features/ai-icp-assistant/
  
  # Copy components if exist
  if [ -d "frontend/components" ]; then
    echo "📝 Copying frontend components..."
    rsync -av \
      --exclude='node_modules/' \
      --exclude='.DS_Store' \
      frontend/components/ /tmp/lad-frontend/web/src/features/ai-icp-assistant/
  fi
  
  # Commit and push
  echo "💾 Committing changes..."
  cd /tmp/lad-frontend
  git config user.name "Manual Sync"
  git config user.email "sync@local"
  git add sdk/features/ai-icp-assistant/
  if [ -d "web/src/features/ai-icp-assistant" ]; then
    git add web/src/features/ai-icp-assistant/
  fi
  
  if git diff --staged --quiet; then
    echo "ℹ️ No changes to commit to LAD-Frontend"
  else
    git commit -m "feat(ai-icp-assistant): manual sync - SDK and components

Synced manually from local workspace"
    
    echo "📤 Pushing to LAD-Frontend/develop..."
    git push origin develop
    echo "✅ LAD-Frontend sync complete!"
  fi
else
  echo "⚠️ No frontend SDK directory found, skipping"
fi

# Cleanup
rm -rf /tmp/lad-backend /tmp/lad-frontend

echo ""
echo "✅ Manual sync completed successfully!"
echo "Backend: ✅"
echo "Frontend: ✅"
