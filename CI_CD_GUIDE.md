# CI/CD Pipeline Documentation

## Overview

This repository uses GitHub Actions for continuous integration and deployment. The pipeline ensures code quality, security, and automated deployment to main repositories.

## Workflows

### 1. PR Validation (`pr-validation.yml`)

**Trigger**: On pull request to `main` branch

**Purpose**: Validate code quality, structure, and security before merging

**Jobs**:

#### `validate`
- ✅ Checks required files exist
- ✅ Validates backend/frontend structure
- ✅ Syntax validation for all JavaScript files
- ✅ Database migration naming convention check
- ✅ Scans for accidentally committed secrets
- ✅ Validates commit message format
- ✅ Tests server startup
- ✅ Generates PR summary with statistics

#### `label-pr`
- 🏷️ Auto-labels PRs based on changed files:
  - `backend` - for backend changes
  - `frontend` - for frontend changes
  - `database` - for migration changes
  - `testing` - for test files
  - `documentation` - for markdown files
- 🏷️ Size labels: `size/XS`, `size/S`, `size/M`, `size/L`, `size/XL`

#### `security-check`
- 🔒 Runs `npm audit` for dependency vulnerabilities
- 🔒 Fails on critical vulnerabilities
- 🔒 Warns on high/moderate vulnerabilities

### 2. Main Branch Protection (`main-branch-protection.yml`)

**Trigger**: On push to `main` branch

**Purpose**: Post-merge validation and automated operations

**Jobs**:

#### `post-merge-validation`
- ✅ Validates merged code
- ✅ Tests server startup
- 🏷️ Creates automatic release tags (`release-YYYY.MM.DD-N`)
- 🚨 Creates GitHub issue if validation fails

#### `sync-to-main-repos`
- 🔄 Triggers sync to LAD-Backend and LAD-Frontend
- 🔄 Runs after successful validation
- 🔄 Handles both backend and frontend separately

#### `update-changelog`
- 📝 Automatically generates changelog entries
- 📝 Creates version from timestamp
- 📝 Lists all commits since last tag

#### `deployment-ready`
- ✅ Marks build as deployment-ready
- ✅ Posts success summary

### 3. Auto-merge (`auto-merge.yml`)

**Trigger**: On PR approval or `auto-merge` label

**Purpose**: Automatically merge approved PRs

**Jobs**:

#### `auto-merge`
- 🔍 Checks for required approvals (minimum 1)
- 🔍 Verifies all checks passed
- 🔍 Confirms no merge conflicts
- ✅ Merges using squash method
- 🗑️ Deletes branch after merge (if not from fork)
- 💬 Posts status comments

#### `dependabot-auto-merge`
- 🤖 Auto-merges Dependabot PRs for patch/minor updates
- ⚠️ Requires manual review for major updates

### 4. Sync to Main (`sync-to-main.yml`)

**Trigger**: On push to `main` or manual dispatch

**Purpose**: Sync feature code to main LAD repositories

**Jobs**:
- 🔄 `sync-backend` - Syncs to LAD-Backend/develop
- 🔄 `sync-frontend` - Syncs to LAD-Frontend/develop

## Required GitHub Secrets

Configure these secrets in GitHub repository settings:

| Secret Name | Description | Required For |
|------------|-------------|--------------|
| `LAD_REPO_TOKEN` | GitHub Personal Access Token with repo access | Syncing to main repos |
| `GEMINI_API_KEY` | Google Gemini API key | Runtime (not CI) |

## Branch Protection Rules

### Recommended Settings for `main` branch:

```yaml
Required Settings:
✅ Require pull request before merging
   - Require 1 approval
   - Dismiss stale approvals when new commits pushed
   - Require review from Code Owners (optional)

✅ Require status checks before merging
   - Require branches to be up to date
   - Required checks:
     * Validate PR (validate job)
     * Security Scan (security-check job)
     * Auto-label PR (label-pr job)

✅ Require conversation resolution before merging

✅ Require linear history (optional)

✅ Do not allow bypassing the above settings

❌ Allow force pushes: Disabled

❌ Allow deletions: Disabled
```

## Setting Up the Pipeline

### 1. GitHub Repository Settings

1. **Go to Settings → Branches**
   - Add rule for `main` branch
   - Configure as per recommendations above

2. **Go to Settings → Secrets and variables → Actions**
   - Add `LAD_REPO_TOKEN`:
     ```
     Create at: https://github.com/settings/tokens
     Scopes needed: repo, workflow
     ```

3. **Go to Settings → General**
   - Enable "Allow auto-merge"
   - Enable "Automatically delete head branches"

4. **Go to Settings → Actions → General**
   - Workflow permissions: "Read and write permissions"
   - Check "Allow GitHub Actions to create and approve pull requests"

### 2. Local Development Setup

```bash
# Clone repository
git clone https://github.com/techiemaya-admin/lad-feature-ai-icp-assistant.git
cd lad-feature-ai-icp-assistant

# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY

# Start test server
npm start
```

### 3. Creating a Pull Request

```bash
# Create feature branch
git checkout -b feature/my-new-feature

# Make changes and commit
git add .
git commit -m "feat: add new feature"

# Push to GitHub
git push origin feature/my-new-feature

# Create PR via GitHub UI or CLI
gh pr create --title "feat: add new feature" --body "Description of changes"
```

### 4. PR Process

1. **PR Created** → Triggers `pr-validation.yml`
   - Auto-labels applied
   - Validation checks run
   - Security scan performed

2. **Review & Approve**
   - At least 1 approval required
   - All checks must pass

3. **Auto-merge** (if enabled)
   - Add `auto-merge` label, OR
   - Auto-merge triggers after approval
   - Branch automatically deleted

4. **Merge to Main** → Triggers multiple workflows:
   - `main-branch-protection.yml`
   - `sync-to-main.yml`
   - Creates release tag
   - Updates changelog
   - Syncs to LAD repositories

## Workflow Status Badges

Add these to your README.md:

```markdown
![PR Validation](https://github.com/techiemaya-admin/lad-feature-ai-icp-assistant/workflows/PR%20Validation/badge.svg)
![Main Branch](https://github.com/techiemaya-admin/lad-feature-ai-icp-assistant/workflows/Main%20Branch%20Protection/badge.svg)
![Sync Status](https://github.com/techiemaya-admin/lad-feature-ai-icp-assistant/workflows/Sync%20to%20LAD%20Main%20Repositories/badge.svg)
```

## Troubleshooting

### PR Validation Fails

**Check:**
- All required files exist
- No syntax errors in JavaScript
- No hardcoded secrets
- Migration files follow naming convention
- Server can start successfully

### Auto-merge Not Working

**Check:**
- PR has required approvals
- All status checks passed
- No merge conflicts
- Auto-merge is enabled in repo settings
- Workflow has write permissions

### Sync Fails

**Check:**
- `LAD_REPO_TOKEN` secret is valid
- Token has `repo` and `workflow` scopes
- Target repositories exist and are accessible
- File paths match expected structure

### Release Tag Creation Fails

**Possible Causes:**
- Tag already exists
- Git push permissions issue

**Solution:**
```bash
# List all tags
git tag -l

# Delete tag if needed
git tag -d release-YYYY.MM.DD-N
git push origin :refs/tags/release-YYYY.MM.DD-N
```

## Manual Operations

### Trigger Sync Manually

```bash
# Via GitHub CLI
gh workflow run sync-to-main.yml

# Via GitHub UI
Actions → Sync to LAD Main Repositories → Run workflow
```

### Create Release Tag Manually

```bash
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

### Run Validation Locally

```bash
# Check syntax
find backend -name "*.js" -type f -exec node --check {} \;

# Test server
npm start

# Run security audit
npm audit
```

## Best Practices

1. **Commit Messages**
   - Use conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, etc.
   - Be descriptive: `feat(chat): add conversation history endpoint`

2. **PR Size**
   - Keep PRs small and focused (< 500 lines preferred)
   - Break large features into multiple PRs

3. **Branch Naming**
   - Use descriptive names: `feature/add-search`, `fix/auth-bug`
   - Avoid generic names: `update`, `changes`

4. **Testing**
   - Test locally before pushing
   - Ensure server starts successfully
   - Check for console errors

5. **Security**
   - Never commit secrets or API keys
   - Use environment variables
   - Keep `.env.example` updated

## CI/CD Metrics

Track these metrics to monitor pipeline health:

- ✅ PR approval rate
- ⏱️ Average time to merge
- 🐛 Validation failure rate
- 🔒 Security vulnerability count
- 🚀 Deployment success rate

## Support

For issues or questions:
- Open an issue in GitHub
- Contact the development team
- Check GitHub Actions logs for details

---

Last Updated: December 2025
