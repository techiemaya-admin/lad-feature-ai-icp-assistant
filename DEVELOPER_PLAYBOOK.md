# AI-ICP-Assistant Developer Playbook

A practical guide for contributing enhancements to the AI-ICP-Assistant feature.

## 📚 Table of Contents

1. [Quick Start](#quick-start)
2. [Development Environment Setup](#development-environment-setup)
3. [Feature Enhancement Example](#feature-enhancement-example)
4. [Testing Your Changes](#testing-your-changes)
5. [Code Review Checklist](#code-review-checklist)
6. [Merge Process](#merge-process)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Prerequisites

- Node.js 18+
- Git
- Access to LAD repositories (optional for local development)
- Google Gemini API key (for testing AI features)

### Clone and Setup

```bash
# 1. Clone the repository
git clone https://github.com/techiemaya-admin/lad-feature-ai-icp-assistant
cd lad-feature-ai-icp-assistant

# 2. Install dependencies (if needed)
npm install

# 3. Create your feature branch
git checkout -b feature/your-enhancement-name
```

---

## Development Environment Setup

### Environment Variables

Create a `.env.local` file for testing (never commit this):

```bash
# .env.local
GEMINI_API_KEY=your_api_key_here
NODE_ENV=development
```

### IDE Setup (VS Code)

Recommended extensions:
- ESLint
- Prettier
- JavaScript and TypeScript Nightly
- GitLens

### Project Structure Understanding

```
lad-feature-ai-icp-assistant/
├── backend/                    # Backend API and services
│   ├── manifest.js            # Feature registration (rarely changed)
│   ├── routes/
│   │   └── routes.js          # API endpoints
│   └── services/
│       └── AIAssistantService.js  # Core business logic
│
├── frontend/                   # Frontend SDK and components
│   ├── sdk/                   # Main SDK (used by LAD-Frontend)
│   │   ├── index.ts           # Public exports
│   │   ├── types.ts           # TypeScript types
│   │   ├── aiICPAssistantService.ts  # Service class
│   │   └── services/
│   │       └── mayaAIService.ts     # AI service implementation
│   └── components/            # React components (if any)
│
└── scripts/                   # Merge utilities
    ├── merge-to-backend.sh
    └── merge-to-frontend.sh
```

---

## Feature Enhancement Example

Let's walk through a real example: **Adding a "Lead Scoring" feature to the AI Assistant**.

### Step 1: Understanding the Requirement

**Feature Request**: Add AI-powered lead scoring that analyzes lead data and returns a quality score (0-100).

**User Story**: As a sales rep, I want the AI assistant to score leads automatically so I can prioritize high-quality prospects.

**Acceptance Criteria**:
- New API endpoint: `POST /api/ai-icp-assistant/score-lead`
- Input: Lead data (company name, industry, size, etc.)
- Output: Score (0-100) with reasoning
- Integration with existing chat context

### Step 2: Create Feature Branch

```bash
# Create a descriptive branch name
git checkout -b feature/add-lead-scoring

# Verify you're on the right branch
git branch
```

### Step 3: Backend Implementation

#### 3.1 Update AIAssistantService.js

Add the lead scoring method to `backend/services/AIAssistantService.js`:

```javascript
/**
 * Score a lead based on ICP criteria using AI
 * @param {Object} leadData - Lead information
 * @param {string} leadData.companyName - Company name
 * @param {string} leadData.industry - Industry vertical
 * @param {number} leadData.employeeCount - Number of employees
 * @param {string} leadData.revenue - Annual revenue range
 * @param {Object} icpCriteria - Ideal Customer Profile criteria
 * @returns {Promise<Object>} Score and reasoning
 */
async scoreLeadWithAI(leadData, icpCriteria) {
  try {
    // Validate input
    if (!leadData || !leadData.companyName) {
      throw new Error('Lead data with company name is required');
    }

    // Construct AI prompt for lead scoring
    const prompt = `
You are a B2B lead qualification expert. Analyze this lead and score it from 0-100 based on how well it matches the Ideal Customer Profile (ICP).

Lead Information:
- Company: ${leadData.companyName}
- Industry: ${leadData.industry || 'Unknown'}
- Employee Count: ${leadData.employeeCount || 'Unknown'}
- Revenue: ${leadData.revenue || 'Unknown'}

ICP Criteria:
${JSON.stringify(icpCriteria, null, 2)}

Provide:
1. Overall Score (0-100)
2. Confidence Level (Low/Medium/High)
3. Key Matching Factors (list 3-5)
4. Red Flags (if any)
5. Recommendation (Priority: High/Medium/Low)

Format your response as JSON:
{
  "score": <number 0-100>,
  "confidence": "<Low|Medium|High>",
  "matchingFactors": ["factor1", "factor2", ...],
  "redFlags": ["flag1", "flag2", ...],
  "recommendation": "<High|Medium|Low>",
  "reasoning": "<brief explanation>"
}
`;

    // Call Gemini AI
    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Parse AI response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('AI response not in expected JSON format');
    }

    const scoreData = JSON.parse(jsonMatch[0]);

    // Log for analytics
    console.log(`[Lead Scoring] ${leadData.companyName}: Score ${scoreData.score}/100`);

    return {
      success: true,
      leadId: leadData.id,
      companyName: leadData.companyName,
      ...scoreData,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('[AIAssistantService] Lead scoring error:', error);
    
    // Return fallback score
    return {
      success: false,
      error: error.message,
      score: 50, // Neutral score on error
      confidence: 'Low',
      reasoning: 'Error occurred during scoring. Manual review recommended.'
    };
  }
}
```

#### 3.2 Add API Route

Update `backend/routes/routes.js` to add the new endpoint:

```javascript
/**
 * Score a lead using AI analysis
 * POST /api/ai-icp-assistant/score-lead
 */
router.post('/score-lead', async (req, res) => {
  try {
    const { leadData, icpCriteria } = req.body;

    // Validation
    if (!leadData) {
      return res.status(400).json({
        success: false,
        error: 'Lead data is required'
      });
    }

    // Use default ICP if not provided
    const defaultICP = {
      targetIndustries: ['Technology', 'SaaS', 'Financial Services'],
      companySize: '50-500 employees',
      revenueRange: '$5M-$50M',
      decisionMakers: ['C-Level', 'VP', 'Director']
    };

    const criteria = icpCriteria || defaultICP;

    // Get AI service instance
    const aiService = req.app.locals.aiAssistantService;
    if (!aiService) {
      throw new Error('AI Assistant service not initialized');
    }

    // Score the lead
    const result = await aiService.scoreLeadWithAI(leadData, criteria);

    // Track usage for billing
    if (req.user) {
      console.log(`[Analytics] User ${req.user.userId} scored lead: ${leadData.companyName}`);
    }

    return res.json(result);

  } catch (error) {
    console.error('[API] Lead scoring error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to score lead',
      details: error.message
    });
  }
});
```

### Step 4: Frontend SDK Implementation

#### 4.1 Update TypeScript Types

Add new types to `frontend/sdk/types.ts`:

```typescript
/**
 * Lead data for scoring
 */
export interface LeadData {
  id?: string;
  companyName: string;
  industry?: string;
  employeeCount?: number;
  revenue?: string;
  location?: string;
  website?: string;
}

/**
 * ICP criteria for lead scoring
 */
export interface ICPCriteria {
  targetIndustries?: string[];
  companySize?: string;
  revenueRange?: string;
  decisionMakers?: string[];
  geographies?: string[];
}

/**
 * Lead scoring result
 */
export interface LeadScoringResult {
  success: boolean;
  leadId?: string;
  companyName: string;
  score: number;
  confidence: 'Low' | 'Medium' | 'High';
  matchingFactors: string[];
  redFlags: string[];
  recommendation: 'High' | 'Medium' | 'Low';
  reasoning: string;
  timestamp: string;
  error?: string;
}
```

#### 4.2 Add Service Method

Update `frontend/sdk/aiICPAssistantService.ts`:

```typescript
import { LeadData, ICPCriteria, LeadScoringResult } from './types';

export class AIICPAssistantService {
  // ... existing code ...

  /**
   * Score a lead using AI analysis
   * @param leadData - Lead information to score
   * @param icpCriteria - Optional ICP criteria (uses default if not provided)
   * @returns Promise with scoring result
   */
  async scoreLead(
    leadData: LeadData,
    icpCriteria?: ICPCriteria
  ): Promise<LeadScoringResult> {
    try {
      const response = await fetch(`${this.baseUrl}/score-lead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        },
        credentials: 'include',
        body: JSON.stringify({
          leadData,
          icpCriteria
        })
      });

      if (!response.ok) {
        throw new Error(`Lead scoring failed: ${response.statusText}`);
      }

      const result: LeadScoringResult = await response.json();
      
      // Log for debugging
      console.log(`[AI-ICP-Assistant] Lead scored: ${leadData.companyName} - ${result.score}/100`);
      
      return result;

    } catch (error) {
      console.error('[AI-ICP-Assistant] Lead scoring error:', error);
      throw error;
    }
  }

  /**
   * Batch score multiple leads
   * @param leads - Array of leads to score
   * @param icpCriteria - ICP criteria to use
   * @returns Promise with array of scoring results
   */
  async scoreLeadBatch(
    leads: LeadData[],
    icpCriteria?: ICPCriteria
  ): Promise<LeadScoringResult[]> {
    const results = await Promise.allSettled(
      leads.map(lead => this.scoreLead(lead, icpCriteria))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        // Return error result for failed scoring
        return {
          success: false,
          companyName: leads[index].companyName,
          score: 0,
          confidence: 'Low',
          matchingFactors: [],
          redFlags: ['Scoring failed'],
          recommendation: 'Low',
          reasoning: result.reason?.message || 'Unknown error',
          timestamp: new Date().toISOString(),
          error: result.reason?.message
        } as LeadScoringResult;
      }
    });
  }

  private getAuthToken(): string {
    // Get token from cookies or localStorage
    return document.cookie
      .split('; ')
      .find(row => row.startsWith('access_token='))
      ?.split('=')[1] || '';
  }
}
```

#### 4.3 Update Public Exports

Update `frontend/sdk/index.ts`:

```typescript
export { AIICPAssistantService } from './aiICPAssistantService';
export { mayaAI } from './services/mayaAIService';

// Export types
export type {
  MayaMessage,
  MayaResponse,
  OnboardingContext,
  LeadData,           // NEW
  ICPCriteria,        // NEW
  LeadScoringResult   // NEW
} from './types';
```

### Step 5: Commit Your Changes

```bash
# Check what files changed
git status

# Review your changes
git diff

# Stage the changes
git add backend/services/AIAssistantService.js
git add backend/routes/routes.js
git add frontend/sdk/types.ts
git add frontend/sdk/aiICPAssistantService.ts
git add frontend/sdk/index.ts

# Commit with descriptive message
git commit -m "feat: add AI-powered lead scoring functionality

- Added scoreLeadWithAI method to AIAssistantService
- Created new API endpoint POST /api/ai-icp-assistant/score-lead
- Added TypeScript types: LeadData, ICPCriteria, LeadScoringResult
- Implemented scoreLead and scoreLeadBatch methods in SDK
- Includes error handling and fallback scoring

Closes #123"
```

### Step 6: Push and Create Pull Request

```bash
# Push to your feature branch
git push origin feature/add-lead-scoring

# Go to GitHub and create a Pull Request
# https://github.com/techiemaya-admin/lad-feature-ai-icp-assistant/compare
```

---

## Testing Your Changes

### Local Backend Testing

Create a test file `backend/tests/leadScoring.test.js`:

```javascript
const AIAssistantService = require('../services/AIAssistantService');

// Mock test
async function testLeadScoring() {
  const service = new AIAssistantService();

  const testLead = {
    companyName: 'Acme Corp',
    industry: 'Technology',
    employeeCount: 250,
    revenue: '$10M-$50M'
  };

  const icpCriteria = {
    targetIndustries: ['Technology', 'SaaS'],
    companySize: '100-500 employees',
    revenueRange: '$5M-$50M'
  };

  try {
    const result = await service.scoreLeadWithAI(testLead, icpCriteria);
    console.log('✅ Lead Scoring Result:', JSON.stringify(result, null, 2));
    
    if (result.score >= 0 && result.score <= 100) {
      console.log('✅ Score is within valid range');
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testLeadScoring();
```

Run the test:
```bash
cd backend
node tests/leadScoring.test.js
```

### Frontend SDK Testing

Create a test HTML file `frontend/tests/sdk-test.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <title>AI-ICP-Assistant SDK Test</title>
</head>
<body>
  <h1>Lead Scoring Test</h1>
  <button onclick="testLeadScoring()">Test Lead Scoring</button>
  <pre id="result"></pre>

  <script type="module">
    import { AIICPAssistantService } from '../sdk/aiICPAssistantService.ts';

    const service = new AIICPAssistantService('http://localhost:3000');

    window.testLeadScoring = async function() {
      const lead = {
        companyName: 'Test Company Inc',
        industry: 'SaaS',
        employeeCount: 150,
        revenue: '$5M-$10M'
      };

      try {
        const result = await service.scoreLead(lead);
        document.getElementById('result').textContent = 
          JSON.stringify(result, null, 2);
      } catch (error) {
        document.getElementById('result').textContent = 
          'Error: ' + error.message;
      }
    };
  </script>
</body>
</html>
```

### Integration Testing

Test the full flow in LAD environment:

```bash
# 1. Merge to LAD-Backend develop branch
cd ~/Desktop/AI-Maya/lad-feature-ai-icp-assistant
npm run merge:backend

# 2. Test the endpoint
curl -X POST http://localhost:3000/api/ai-icp-assistant/score-lead \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "leadData": {
      "companyName": "Example Corp",
      "industry": "Technology",
      "employeeCount": 500
    }
  }'

# Expected response:
# {
#   "success": true,
#   "companyName": "Example Corp",
#   "score": 75,
#   "confidence": "High",
#   "matchingFactors": [...],
#   "recommendation": "High"
# }
```

---

## Code Review Checklist

Before submitting your PR, verify:

### ✅ Code Quality
- [ ] No console.log() statements (use proper logging)
- [ ] All functions have JSDoc comments
- [ ] Error handling implemented for all async operations
- [ ] TypeScript types exported and documented
- [ ] No hardcoded values (use constants/config)

### ✅ LAD Standards Compliance
- [ ] Files are under 400 lines (LAD maximum)
- [ ] Functions are under 50 lines
- [ ] Follows feature-based architecture
- [ ] No breaking changes to existing APIs
- [ ] Backward compatible

### ✅ Testing
- [ ] Unit tests written and passing
- [ ] Integration test performed
- [ ] Error scenarios tested
- [ ] Edge cases handled

### ✅ Documentation
- [ ] README updated if needed
- [ ] API documentation added
- [ ] Example usage provided
- [ ] Breaking changes documented in UPGRADE_NOTES.md

### ✅ Security
- [ ] No sensitive data in code
- [ ] Input validation implemented
- [ ] Authorization checks in place
- [ ] Rate limiting considered

---

## Merge Process

### Option 1: Automated Sync (Recommended)

After PR is merged to `main` branch:

1. GitHub Actions automatically syncs to LAD-Backend and LAD-Frontend
2. Monitor workflow: https://github.com/techiemaya-admin/lad-feature-ai-icp-assistant/actions
3. Verify changes appeared in LAD repos

### Option 2: Manual Sync

```bash
# Sync to backend
npm run merge:backend

# Review changes before pushing
# Follow prompts to commit and push

# Sync to frontend
npm run merge:frontend

# Review changes before pushing
# Follow prompts to commit and push
```

### Post-Merge Verification

```bash
# 1. Check LAD-Backend
cd ~/Desktop/AI-Maya/LAD-Backend
git pull origin develop
# Verify your changes in features/ai-icp-assistant/

# 2. Check LAD-Frontend
cd ~/Desktop/AI-Maya/LAD/frontend
git pull origin develop
# Verify your changes in sdk/features/ai-icp-assistant/

# 3. Test in deployed environment
# Check Cloud Run logs after deployment
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=lad-backend-develop" --limit 50 --project=salesmaya-pluto
```

---

## Best Practices

### Commit Messages

Follow conventional commits:

```bash
# Feature
git commit -m "feat(scoring): add lead scoring API endpoint"

# Bug fix
git commit -m "fix(scoring): handle null values in lead data"

# Documentation
git commit -m "docs(scoring): add API usage examples"

# Refactoring
git commit -m "refactor(scoring): extract score calculation logic"

# Breaking change
git commit -m "feat(scoring)!: change score range to 0-1000

BREAKING CHANGE: Score range changed from 0-100 to 0-1000"
```

### File Organization

Keep files focused and small:

```javascript
// ❌ Bad: 800-line service file
class AIAssistantService {
  // Everything in one file
}

// ✅ Good: Split into focused files
// services/AIAssistantService.js (core orchestration)
// services/scoring/LeadScorer.js (scoring logic)
// services/scoring/ScoreCalculator.js (calculations)
// services/chat/ChatHandler.js (chat logic)
```

### Error Handling Pattern

Always handle errors gracefully:

```javascript
async function scoreLead(leadData) {
  try {
    // Validate input
    if (!leadData?.companyName) {
      throw new Error('Company name is required');
    }

    // Main logic
    const result = await performScoring(leadData);

    // Return success
    return { success: true, ...result };

  } catch (error) {
    // Log error
    console.error('[scoreLead] Error:', error);

    // Return safe fallback
    return {
      success: false,
      error: error.message,
      fallbackData: getDefaultScore()
    };
  }
}
```

### API Response Format

Maintain consistent response structure:

```javascript
// Success response
{
  "success": true,
  "data": { ... },
  "timestamp": "2025-12-22T12:00:00Z"
}

// Error response
{
  "success": false,
  "error": "Human-readable error message",
  "details": "Technical details",
  "code": "ERROR_CODE"
}
```

---

## Troubleshooting

### Issue: Gemini API Rate Limit

**Symptom**: Errors about quota exceeded

**Solution**:
```javascript
// Add retry logic with exponential backoff
async function callGeminiWithRetry(prompt, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await model.generateContent(prompt);
    } catch (error) {
      if (error.message.includes('quota') && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}
```

### Issue: TypeScript Compilation Errors

**Symptom**: `tsc` errors in frontend SDK

**Solution**:
```bash
# Check TypeScript version
cd frontend/sdk
npx tsc --version

# Compile and check errors
npx tsc --noEmit

# Fix type mismatches in types.ts
```

### Issue: Merge Conflicts

**Symptom**: Git conflicts during merge

**Solution**:
```bash
# Update your branch with latest main
git checkout feature/your-branch
git fetch origin
git rebase origin/main

# Resolve conflicts
# Edit conflicting files
git add .
git rebase --continue

# Force push (since history changed)
git push --force-with-lease origin feature/your-branch
```

### Issue: Tests Pass Locally but Fail in LAD

**Symptom**: Integration tests fail after merge

**Solution**:
```bash
# Check for missing dependencies in LAD
cd ~/Desktop/AI-Maya/LAD-Backend
npm list @google/generative-ai

# Check environment variables
cat .env | grep GEMINI

# Check LAD-specific configurations
# May need to update feature_registry.js
```

---

## Quick Reference Commands

```bash
# Development
npm run merge:backend      # Merge to LAD-Backend
npm run merge:frontend     # Merge to LAD-Frontend
npm test                   # Run tests

# Git workflow
git checkout -b feature/name
git add .
git commit -m "feat: description"
git push origin feature/name

# Testing
node backend/tests/yourTest.js
curl -X POST http://localhost:3000/api/ai-icp-assistant/your-endpoint

# Debugging
git log --oneline -5
git diff main
git status
```

---

## Additional Resources

- [LAD Architecture Guide](../../lad-docs/ARCHITECTURE_REFACTORING.md)
- [Feature Migration Guide](../../lad-docs/MIGRATION_GUIDE.md)
- [API Routes Documentation](../../lad-docs/API_ROUTES_MIGRATION.md)
- [Testing Guide](../../tests/README.md)

---

## Questions?

- **Feature Repo Issues**: https://github.com/techiemaya-admin/lad-feature-ai-icp-assistant/issues
- **LAD Backend**: https://github.com/techiemaya-admin/LAD-Backend
- **LAD Frontend**: https://github.com/techiemaya-admin/LAD-Frontend

---

**Happy Coding! 🚀**

Last Updated: December 22, 2025
