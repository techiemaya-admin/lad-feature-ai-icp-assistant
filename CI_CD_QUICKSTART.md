# CI/CD Pipeline - Quick Start Guide

## ✅ What Was Set Up

Your repository now has a complete CI/CD pipeline with:

### 1. Three GitHub Actions Workflows

📄 **`.github/workflows/pr-validation.yml`**
- Validates PRs before merging
- Checks code quality, syntax, and security
- Auto-labels PRs by type and size
- Runs security audits

📄 **`.github/workflows/auto-merge.yml`**
- Automatically merges approved PRs
- Handles Dependabot updates
- Deletes branches after merge

📄 **`.github/workflows/main-branch-protection.yml`**
- Validates code after merge to main
- Creates release tags automatically
- Updates changelog
- Triggers sync to LAD repositories

### 2. Documentation

📄 **`CI_CD_GUIDE.md`** - Complete pipeline documentation
📄 **`README.md`** - Updated with CI/CD badges and info

### 3. Setup Script

📄 **`scripts/setup-github-repo.sh`** - Automated GitHub configuration

---

## 🚀 Next Steps (Required)

### Step 1: Run Setup Script

```bash
cd /Users/naveenreddy/Desktop/AI-Maya/lad-feature-ai-icp-assistant
./scripts/setup-github-repo.sh
```

This will:
- Create all required labels
- Configure repository settings
- Show you what needs manual configuration

### Step 2: Configure Branch Protection (Manual)

Go to: https://github.com/techiemaya-admin/lad-feature-ai-icp-assistant/settings/branches

Click **"Add branch protection rule"** and configure:

**Branch name pattern:** `main`

**Enable these settings:**

✅ **Require a pull request before merging**
   - Require approvals: `1`
   - Dismiss stale pull request approvals when new commits are pushed

✅ **Require status checks to pass before merging**
   - Require branches to be up to date before merging
   - Add these status checks from **PR Validation** workflow:
     * `validate` (Validate PR)
     * `label-pr` (Auto-label PR)
     * `security-check` (Security Scan)
   
   **Note:** You're currently seeing checks from the **main branch workflows** (Post-Merge Validation, Sync, etc.). 
   The PR validation checks will appear after you create your **first pull request**. 
   
   For now, you can either:
   - Skip adding status checks and add them after your first PR, OR
   - Create a test PR first to register the checks, then add them here

✅ **Require conversation resolution before merging**

✅ **Do not allow bypassing the above settings**

❌ **Allow force pushes:** Disabled

❌ **Allow deletions:** Disabled

Click **"Create"** to save.

### Step 3: Add Required Secret

Go to: https://github.com/techiemaya-admin/lad-feature-ai-icp-assistant/settings/secrets/actions

Click **"New repository secret"**

**Name:** `LAD_REPO_TOKEN`

**Value:** [Your GitHub Personal Access Token]

To create a token:
1. Go to: https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes: `repo` and `workflow`
4. Generate and copy the token
5. Paste it as the secret value

### Step 4: Enable Auto-merge

Go to: https://github.com/techiemaya-admin/lad-feature-ai-icp-assistant/settings

Under **"Pull Requests"** section:

✅ Enable "Allow auto-merge"
✅ Enable "Automatically delete head branches"

Under **"Merge button"** section:

✅ Enable "Allow squash merging"
❌ Disable "Allow merge commits"
❌ Disable "Allow rebase merging"

Click **"Save"** at the bottom.

### Step 5: Configure Workflow Permissions

Go to: https://github.com/techiemaya-admin/lad-feature-ai-icp-assistant/settings/actions

Under **"Workflow permissions"**:

⚪ Select "Read and write permissions"

✅ Check "Allow GitHub Actions to create and approve pull requests"

Click **"Save"**

---

## 🧪 Test the Pipeline

### Create a Test PR

```bash
# Create a test branch
git checkout -b test/ci-pipeline

# Make a small change
echo "# Testing CI/CD Pipeline" >> TEST.md
git add TEST.md
git commit -m "test: verify CI/CD pipeline"

# Push to GitHub
git push origin test/ci-pipeline

# Create PR (via GitHub CLI)
gh pr create --title "test: CI/CD pipeline validation" --body "Testing the new CI/CD pipeline"
```

### What Should Happen

1. ✅ PR is created
2. ✅ PR validation workflow runs automatically
3. ✅ PR is auto-labeled (size/XS, documentation)
4. ✅ Security scan completes
5. ✅ All checks pass
6. ✅ You can approve the PR
7. ✅ After approval, PR auto-merges (if enabled)
8. ✅ Main branch protection runs
9. ✅ Release tag created
10. ✅ Changes sync to LAD repos

---

## 📊 Monitoring

### View Workflow Runs

https://github.com/techiemaya-admin/lad-feature-ai-icp-assistant/actions

### Check Pipeline Status

The README now shows status badges:
- PR Validation status
- Main Branch status  
- Sync status

### Review Labels

https://github.com/techiemaya-admin/lad-feature-ai-icp-assistant/labels

Should see:
- backend, frontend, database
- testing, documentation
- size/* labels
- auto-merge, urgent, ci-failure

---

## 🔍 Troubleshooting

### Workflows Not Running?

**Check:**
1. Workflow permissions are set correctly
2. Branch protection requires the right status checks
3. `.github/workflows/` files are in the main branch

### Auto-merge Not Working?

**Check:**
1. Auto-merge is enabled in repo settings
2. PR has required approvals
3. All status checks passed
4. No merge conflicts exist

### Sync Failing?

**Check:**
1. `LAD_REPO_TOKEN` secret is configured
2. Token has `repo` and `workflow` scopes
3. Token hasn't expired
4. You have access to LAD-Backend and LAD-Frontend repos

---

## 📖 Learn More

- **Complete guide:** [CI_CD_GUIDE.md](CI_CD_GUIDE.md)
- **Development workflow:** [DEVELOPER_PLAYBOOK.md](DEVELOPER_PLAYBOOK.md)
- **Merge process:** [MERGE_PIPELINE.md](MERGE_PIPELINE.md)

---

## 🎉 You're All Set!

Once you complete the steps above, your CI/CD pipeline will:

✅ Automatically validate all PRs
✅ Run security scans
✅ Auto-label and organize PRs
✅ Auto-merge approved changes
✅ Sync to LAD repositories
✅ Generate changelogs
✅ Create release tags

**Questions?** Check [CI_CD_GUIDE.md](CI_CD_GUIDE.md) or open an issue!
