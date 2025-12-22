# Quick Setup Guide for GitHub Actions

## Step 1: Create the GitHub Repository

Manually create the repository on GitHub:

1. Go to https://github.com/techiemaya-admin
2. Click "New repository"
3. Repository name: `lad-feature-ai-icp-assistant`
4. Description: `AI-powered ICP Assistant feature for LAD platform - isolated development repository`
5. Public repository
6. **Do NOT initialize with README** (we already have one)
7. Click "Create repository"

## Step 2: Push Local Repository

```bash
cd ~/Desktop/AI-Maya/lad-feature-ai-icp-assistant

# Push to GitHub (remote is already configured)
git push -u origin main
```

## Step 3: Configure GitHub Actions Secret

For automated syncing to work, you need to add a Personal Access Token:

### 3.1 Create Personal Access Token

1. Go to https://github.com/settings/tokens
2. Click "Generate new token" → "Generate new token (classic)"
3. Token name: `LAD-Feature-Sync-Token`
4. Expiration: 90 days (or as needed)
5. Scopes: Select `repo` (full control of private repositories)
6. Click "Generate token"
7. **COPY THE TOKEN** (you won't see it again!)

### 3.2 Add Secret to Feature Repository

1. Go to https://github.com/techiemaya-admin/lad-feature-ai-icp-assistant
2. Click "Settings" → "Secrets and variables" → "Actions"
3. Click "New repository secret"
4. Name: `LAD_REPO_TOKEN`
5. Value: Paste the token you copied
6. Click "Add secret"

## Step 4: Test the Setup

### Option A: Manual Trigger (Recommended for first test)

1. Go to https://github.com/techiemaya-admin/lad-feature-ai-icp-assistant/actions
2. Click on "Sync to LAD Main Repositories" workflow
3. Click "Run workflow" → "Run workflow"
4. Watch the workflow run
5. Check LAD-Backend and LAD-Frontend repos for new commits

### Option B: Test with a Commit

```bash
cd ~/Desktop/AI-Maya/lad-feature-ai-icp-assistant

# Make a small change
echo "# Test sync" >> backend/TEST.md

# Commit and push
git add backend/TEST.md
git commit -m "test: verify automated sync"
git push origin main

# Watch GitHub Actions run
# Go to: https://github.com/techiemaya-admin/lad-feature-ai-icp-assistant/actions
```

## Step 5: Share with Other Developer

Send them this information:

```
📦 AI-ICP-Assistant Feature Repository

Repository: https://github.com/techiemaya-admin/lad-feature-ai-icp-assistant

Quick Start:
1. Clone the repo:
   git clone https://github.com/techiemaya-admin/lad-feature-ai-icp-assistant
   cd lad-feature-ai-icp-assistant

2. Create a feature branch:
   git checkout -b feature/your-enhancement

3. Make your changes in backend/ or frontend/ directories

4. Test locally:
   npm test

5. Commit and push:
   git add .
   git commit -m "feat: description of your enhancement"
   git push origin feature/your-enhancement

6. Create PR on GitHub

7. After approval, changes will auto-sync to LAD main repos

Documentation:
- README.md - Feature overview and API reference
- MERGE_PIPELINE.md - Detailed merge process
- backend/UPGRADE_NOTES.md - Migration notes

Scripts:
- npm run merge:backend - Manual merge to LAD-Backend
- npm run merge:frontend - Manual merge to LAD-Frontend
```

## Troubleshooting

### Issue: GitHub Actions failing with authentication error

**Solution**: Verify the `LAD_REPO_TOKEN` secret:
- Check it's named exactly `LAD_REPO_TOKEN` (case-sensitive)
- Ensure the token has `repo` scope
- Generate a new token if expired

### Issue: Workflows not running

**Solution**: Enable Actions in repository:
1. Go to repository Settings → Actions → General
2. Set "Actions permissions" to "Allow all actions"
3. Click "Save"

### Issue: Merge conflicts during auto-sync

**Solution**: Use manual merge:
```bash
cd ~/Desktop/AI-Maya/lad-feature-ai-icp-assistant
npm run merge:backend   # or merge:frontend
# Resolve conflicts manually
```

## Next Steps

After setup is complete:

1. ✅ Test automated sync works
2. ✅ Share repository link with developer
3. ✅ Add developer as collaborator (Settings → Collaborators)
4. ✅ Document any custom setup requirements
5. ✅ Set up branch protection rules (optional)

## Commands Reference

```bash
# Clone repository
git clone https://github.com/techiemaya-admin/lad-feature-ai-icp-assistant

# Manual merge to backend
npm run merge:backend

# Manual merge to frontend
npm run merge:frontend

# Run tests
npm test

# Check repository status
git status
git log --oneline -5
```

---

**Setup Complete!** 🎉

The repository is ready for collaborative development with automated syncing to LAD main repositories.
