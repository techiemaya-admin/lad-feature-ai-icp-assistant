# Merge Pipeline: AI-ICP-Assistant → LAD Main Repository

This document outlines the process for merging changes from the isolated `lad-feature-ai-icp-assistant` repository into the main LAD repository (Backend and Frontend).

## 🎯 Overview

**Purpose**: Keep the ai-icp-assistant feature synchronized with the main LAD codebase while maintaining isolated development.

**Repositories**:
- **Feature Repo**: `lad-feature-ai-icp-assistant` (isolated development)
- **Backend Target**: `LAD-Backend/features/ai-icp-assistant/`
- **Frontend Target**: `LAD-Frontend/sdk/features/ai-icp-assistant/`

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Method 1: Manual Merge (Recommended for First Time)](#method-1-manual-merge)
3. [Method 2: Git Subtree (Advanced)](#method-2-git-subtree)
4. [Method 3: GitHub Actions (Automated)](#method-3-github-actions)
5. [Testing Strategy](#testing-strategy)
6. [Rollback Procedures](#rollback-procedures)

---

## Quick Start

**For developers who want to contribute enhancements:**

```bash
# 1. Clone the feature repository
git clone https://github.com/techiemaya-admin/lad-feature-ai-icp-assistant
cd lad-feature-ai-icp-assistant

# 2. Create a feature branch
git checkout -b feature/your-enhancement

# 3. Make your changes
# ... edit files ...

# 4. Test locally
npm test

# 5. Commit and push
git add .
git commit -m "feat: your enhancement description"
git push origin feature/your-enhancement

# 6. Create Pull Request on GitHub
# After approval, use merge scripts to sync to LAD main repos
```

---

## Method 1: Manual Merge

**Best for**: First-time merges, complex changes, when you need full control

### Prerequisites

```bash
# Ensure you have all three repos cloned
~/Desktop/AI-Maya/
├── lad-feature-ai-icp-assistant/  # Feature repo
├── LAD-Backend/                    # Backend main repo
└── LAD-Frontend/                   # Frontend main repo (LAD/frontend in workspace)
```

### Backend Merge Steps

```bash
#!/bin/bash
# Script: merge-backend.sh

# Step 1: Navigate to feature repo
cd ~/Desktop/AI-Maya/lad-feature-ai-icp-assistant

# Step 2: Ensure you're on the main branch with latest changes
git checkout main
git pull origin main

# Step 3: Navigate to LAD-Backend
cd ~/Desktop/AI-Maya/LAD-Backend

# Step 4: Create a feature branch in main repo
git checkout develop
git pull origin develop
git checkout -b feature/ai-icp-assistant-update-$(date +%Y%m%d)

# Step 5: Copy backend files
# Remove old files
rm -rf features/ai-icp-assistant/services/*
rm -rf features/ai-icp-assistant/routes/*
rm -f features/ai-icp-assistant/manifest.js
rm -f features/ai-icp-assistant/UPGRADE_NOTES.md

# Copy new files from feature repo
cp ~/Desktop/AI-Maya/lad-feature-ai-icp-assistant/backend/services/* \
   features/ai-icp-assistant/services/

cp ~/Desktop/AI-Maya/lad-feature-ai-icp-assistant/backend/routes/* \
   features/ai-icp-assistant/routes/

cp ~/Desktop/AI-Maya/lad-feature-ai-icp-assistant/backend/manifest.js \
   features/ai-icp-assistant/

cp ~/Desktop/AI-Maya/lad-feature-ai-icp-assistant/backend/UPGRADE_NOTES.md \
   features/ai-icp-assistant/

# Step 6: Review changes
git status
git diff

# Step 7: Test
npm test

# Step 8: Commit
git add features/ai-icp-assistant/
git commit -m "feat(ai-icp-assistant): merge updates from feature repo

- Updated services and routes
- Enhanced AI capabilities
- See lad-feature-ai-icp-assistant commits for details"

# Step 9: Push to develop branch
git push origin feature/ai-icp-assistant-update-$(date +%Y%m%d)

# Step 10: Create PR on GitHub to merge into develop
echo "✅ Backend merge complete. Create PR on GitHub."
```

### Frontend Merge Steps

```bash
#!/bin/bash
# Script: merge-frontend.sh

# Step 1: Navigate to LAD-Frontend (or LAD/frontend in workspace)
cd ~/Desktop/AI-Maya/LAD/frontend

# Step 2: Create a feature branch
git checkout develop
git pull origin develop
git checkout -b feature/ai-icp-assistant-sdk-update-$(date +%Y%m%d)

# Step 3: Copy SDK files
# Remove old SDK files
rm -rf sdk/features/ai-icp-assistant/*

# Copy new SDK files from feature repo
cp -r ~/Desktop/AI-Maya/lad-feature-ai-icp-assistant/frontend/sdk/* \
   sdk/features/ai-icp-assistant/

# Step 4: Copy component files (if any)
if [ -d "web/src/features/ai-icp-assistant" ]; then
  rm -rf web/src/features/ai-icp-assistant/*
  cp -r ~/Desktop/AI-Maya/lad-feature-ai-icp-assistant/frontend/components/* \
     web/src/features/ai-icp-assistant/
fi

# Step 5: Review changes
git status
git diff

# Step 6: Test
cd web && npm run build && npm test

# Step 7: Commit
git add sdk/features/ai-icp-assistant/ web/src/features/ai-icp-assistant/
git commit -m "feat(ai-icp-assistant): merge SDK updates from feature repo

- Updated SDK services
- Enhanced TypeScript types
- See lad-feature-ai-icp-assistant commits for details"

# Step 8: Push to develop branch
git push origin feature/ai-icp-assistant-sdk-update-$(date +%Y%m%d)

# Step 9: Create PR on GitHub to merge into develop
echo "✅ Frontend merge complete. Create PR on GitHub."
```

### Save These Scripts

```bash
# Create executable scripts
cd ~/Desktop/AI-Maya/lad-feature-ai-icp-assistant

# Create scripts directory
mkdir -p scripts

# Save backend merge script
cat > scripts/merge-to-backend.sh << 'EOF'
#!/bin/bash
# ... paste backend merge script here ...
EOF

# Save frontend merge script
cat > scripts/merge-to-frontend.sh << 'EOF'
#!/bin/bash
# ... paste frontend merge script here ...
EOF

# Make executable
chmod +x scripts/merge-to-backend.sh
chmod +x scripts/merge-to-frontend.sh
```

---

## Method 2: Git Subtree

**Best for**: Regular syncing, automated workflows

### Setup (One-time)

```bash
# In LAD-Backend repository
cd ~/Desktop/AI-Maya/LAD-Backend
git remote add ai-icp-assistant-feature https://github.com/techiemaya-admin/lad-feature-ai-icp-assistant
git fetch ai-icp-assistant-feature

# In LAD-Frontend repository
cd ~/Desktop/AI-Maya/LAD/frontend
git remote add ai-icp-assistant-feature https://github.com/techiemaya-admin/lad-feature-ai-icp-assistant
git fetch ai-icp-assistant-feature
```

### Merge Backend Changes

```bash
cd ~/Desktop/AI-Maya/LAD-Backend
git checkout develop
git subtree pull --prefix=features/ai-icp-assistant \
  ai-icp-assistant-feature main --squash

# Resolve conflicts if any
git push origin develop
```

### Merge Frontend Changes

```bash
cd ~/Desktop/AI-Maya/LAD/frontend
git checkout develop

# Merge SDK changes
git subtree pull --prefix=sdk/features/ai-icp-assistant \
  ai-icp-assistant-feature main --squash

git push origin develop
```

---

## Method 3: GitHub Actions (Automated)

**Best for**: Continuous integration, regular updates

### Setup GitHub Actions in Feature Repo

Create `.github/workflows/sync-to-main.yml`:

```yaml
name: Sync to LAD Main Repositories

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  sync-backend:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout feature repo
        uses: actions/checkout@v3
        with:
          fetch-depth: 0

      - name: Checkout LAD-Backend
        uses: actions/checkout@v3
        with:
          repository: techiemaya-admin/LAD-Backend
          token: ${{ secrets.LAD_REPO_TOKEN }}
          path: lad-backend
          ref: develop

      - name: Copy backend files
        run: |
          # Remove old files
          rm -rf lad-backend/features/ai-icp-assistant/services/*
          rm -rf lad-backend/features/ai-icp-assistant/routes/*
          rm -f lad-backend/features/ai-icp-assistant/manifest.js
          rm -f lad-backend/features/ai-icp-assistant/UPGRADE_NOTES.md

          # Copy new files
          cp backend/services/* lad-backend/features/ai-icp-assistant/services/
          cp backend/routes/* lad-backend/features/ai-icp-assistant/routes/
          cp backend/manifest.js lad-backend/features/ai-icp-assistant/
          cp backend/UPGRADE_NOTES.md lad-backend/features/ai-icp-assistant/

      - name: Commit and push to LAD-Backend
        working-directory: lad-backend
        run: |
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git add features/ai-icp-assistant/
          git commit -m "feat(ai-icp-assistant): auto-sync from feature repo

          Synced from: ${{ github.sha }}
          " || echo "No changes to commit"
          git push origin develop

  sync-frontend:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout feature repo
        uses: actions/checkout@v3

      - name: Checkout LAD-Frontend
        uses: actions/checkout@v3
        with:
          repository: techiemaya-admin/LAD-Frontend
          token: ${{ secrets.LAD_REPO_TOKEN }}
          path: lad-frontend
          ref: develop

      - name: Copy frontend SDK files
        run: |
          # Remove old SDK
          rm -rf lad-frontend/sdk/features/ai-icp-assistant/*

          # Copy new SDK
          cp -r frontend/sdk/* lad-frontend/sdk/features/ai-icp-assistant/

          # Copy components if exist
          if [ -d "frontend/components" ]; then
            mkdir -p lad-frontend/web/src/features/ai-icp-assistant
            rm -rf lad-frontend/web/src/features/ai-icp-assistant/*
            cp -r frontend/components/* lad-frontend/web/src/features/ai-icp-assistant/
          fi

      - name: Commit and push to LAD-Frontend
        working-directory: lad-frontend
        run: |
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git add sdk/features/ai-icp-assistant/ web/src/features/ai-icp-assistant/
          git commit -m "feat(ai-icp-assistant): auto-sync SDK from feature repo

          Synced from: ${{ github.sha }}
          " || echo "No changes to commit"
          git push origin develop
```

### Setup Repository Secret

1. Go to feature repo: Settings → Secrets → Actions
2. Add new secret: `LAD_REPO_TOKEN`
3. Value: Personal Access Token with `repo` scope

---

## Testing Strategy

### Before Merging

**1. Local Testing in Feature Repo**

```bash
cd ~/Desktop/AI-Maya/lad-feature-ai-icp-assistant

# Backend tests
cd backend
npm test

# Frontend tests  
cd ../frontend
npm test
```

**2. Integration Testing in LAD Repos**

```bash
# After copying files but before pushing

# Test backend
cd ~/Desktop/AI-Maya/LAD-Backend
npm test
npm run test:integration

# Test frontend
cd ~/Desktop/AI-Maya/LAD/frontend/web
npm run build
npm test
```

### After Merging

**3. E2E Testing**

```bash
# Use LAD test scripts
cd ~/Desktop/AI-Maya/LAD/tests
./ai-icp-assistant-test.sh
```

**4. Manual Testing Checklist**

- [ ] AI chat functionality works
- [ ] Keyword expansion returns results
- [ ] Conversation history persists
- [ ] Error handling works properly
- [ ] Frontend UI renders correctly
- [ ] No console errors
- [ ] API endpoints respond correctly

---

## Rollback Procedures

### If Backend Merge Fails

```bash
cd ~/Desktop/AI-Maya/LAD-Backend

# Option 1: Revert the commit
git revert HEAD
git push origin develop

# Option 2: Reset to previous commit
git reset --hard HEAD~1
git push --force origin develop

# Option 3: Restore from backup
git checkout develop~1 -- features/ai-icp-assistant/
git commit -m "rollback: restore ai-icp-assistant to previous version"
git push origin develop
```

### If Frontend Merge Fails

```bash
cd ~/Desktop/AI-Maya/LAD/frontend

# Same rollback options as backend
git revert HEAD
git push origin develop
```

### Emergency Rollback

```bash
# Disable feature via feature flags
# Edit: LAD/configs/feature-flags/flags.json

{
  "ai-icp-assistant": {
    "enabled": false,
    "reason": "Rollback in progress"
  }
}

# Commit and deploy
git add configs/feature-flags/flags.json
git commit -m "hotfix: disable ai-icp-assistant feature"
git push origin main
```

---

## Best Practices

1. **Always create feature branches** - Never merge directly to main/develop
2. **Test thoroughly** - Run all tests before pushing
3. **Document changes** - Update UPGRADE_NOTES.md for breaking changes
4. **Code review** - Always get PR approval before merging
5. **Gradual rollout** - Use feature flags to enable for specific users first
6. **Monitor logs** - Watch Cloud Run logs after deployment
7. **Keep sync frequency reasonable** - Don't merge every commit, batch changes

## Troubleshooting

### Common Issues

**Issue**: Files not copying correctly

```bash
# Ensure paths are correct
ls -la ~/Desktop/AI-Maya/lad-feature-ai-icp-assistant/backend/services/
ls -la ~/Desktop/AI-Maya/LAD-Backend/features/ai-icp-assistant/services/
```

**Issue**: Git conflicts during merge

```bash
# Resolve conflicts manually
git status
# Edit conflicting files
git add .
git commit -m "fix: resolve merge conflicts"
```

**Issue**: Tests failing after merge

```bash
# Check for missing dependencies
npm install

# Check environment variables
cat .env

# Run specific test
npm test -- AIAssistantService.test.js
```

---

## Contact & Support

For questions about the merge process:
- **Feature Lead**: [Your Name]
- **Backend Team**: backend-team@example.com
- **Frontend Team**: frontend-team@example.com

---

**Last Updated**: December 22, 2025  
**Pipeline Version**: 1.0.0
