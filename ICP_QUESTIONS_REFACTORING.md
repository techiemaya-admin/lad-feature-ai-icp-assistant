# ICP Questions System Refactoring

## Overview

Refactored the ICP Questions system to be fully database-driven with AI-assisted step progression. All ICP prompts are now stored in the database, and Gemini API is used to understand user input and decide the next step.

## Architecture

```
┌─────────────┐
│  Database   │ ← Single source of truth for all ICP questions
│ icp_questions│
└──────┬──────┘
       │
       ↓
┌─────────────┐
│  Backend    │ ← Fetches questions, orchestrates Gemini
│   API       │
└──────┬──────┘
       │
       ↓
┌─────────────┐
│  Gemini     │ ← Analyzes user answers, decides next step
│   API       │
└──────┬──────┘
       │
       ↓
┌─────────────┐
│  Frontend   │ ← Renders questions, collects answers (NO hardcoded text)
│   UI        │
└─────────────┘
```

## Database Schema

### Table: `icp_questions`

```sql
CREATE TABLE icp_questions (
  id UUID PRIMARY KEY,
  step_index INTEGER NOT NULL,
  title TEXT,
  question TEXT NOT NULL,          -- Prompt text (editable in DB)
  helper_text TEXT,                 -- Examples/hints
  category VARCHAR(100),            -- 'lead_generation', etc.
  intent_key VARCHAR(100) NOT NULL, -- Used by Gemini to map answers
  question_type VARCHAR(50),        -- 'text', 'select', 'multi-select', 'boolean'
  options JSONB,                     -- For select questions
  validation_rules JSONB,            -- Validation config
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

**Key Fields:**
- `intent_key`: Semantic identifier (e.g., 'ideal_customer', 'company_size') used by Gemini
- `question`: All prompt text stored here - editable without code changes
- `is_active`: Can disable questions for A/B testing

## Backend Implementation

### 1. Model: `ICPQuestion.js`
- `findAll(category)`: Get all active questions
- `findByStepIndex(stepIndex, category)`: Get question by step
- `findByIntentKey(intentKey, category)`: Get question by intent
- `count(category)`: Get total steps

### 2. Service: `GeminiIntentService.js`
- `analyzeAnswerAndDecideNextStep()`: Uses Gemini to:
  - Analyze user answer
  - Detect completion status
  - Decide next `step_index` to fetch from DB
  - Return confidence and reasoning

**Gemini Prompt Structure:**
```
- Current context (step, question, user answer)
- Available steps from DB
- Task: Determine next step_index
- Rules: No question generation, only step selection
```

### 3. Controller: `ICPOnboardingController.js`
- `getQuestions()`: GET `/api/ai-icp-assistant/onboarding/icp-questions`
- `getQuestionByStep()`: GET `/api/ai-icp-assistant/onboarding/icp-questions/:stepIndex`
- `processAnswer()`: POST `/api/ai-icp-assistant/onboarding/icp-answer`

### 4. Routes: Added to `backend/routes/index.js`
- All routes prefixed with `/api/ai-icp-assistant/onboarding/`

## Frontend Implementation

### 1. API Service: `icpQuestionsApi.ts`
- `fetchICPQuestions()`: Get all questions from API
- `fetchICPQuestionByStep()`: Get specific question
- `processICPAnswer()`: Send answer, get next step from Gemini

### 2. Updated: `ChatStepController.tsx`
- Fetches questions from API on mount
- Uses `processICPAnswer()` to get next step (Gemini decides)
- No hardcoded question text
- Handles clarification requests from Gemini

### 3. Updated: `icpQuestionsConfig.ts`
- Marked as DEPRECATED
- Kept for backward compatibility
- Added `convertAPIQuestionToLegacy()` helper

## Flow Example

1. **User starts onboarding:**
   - Frontend calls `GET /api/onboarding/icp-questions?category=lead_generation`
   - Backend returns all 7 questions from DB
   - Frontend displays first question

2. **User answers:**
   - Frontend calls `POST /api/onboarding/icp-answer`
   - Body: `{ currentStepIndex: 1, userAnswer: "Logistics companies, SaaS founders" }`
   - Backend:
     - Fetches current question from DB
     - Sends to Gemini: user answer + current question context
     - Gemini responds: `{ nextStepIndex: 2, clarificationNeeded: false }`
     - Backend fetches step 2 question from DB
     - Returns next question to frontend

3. **Frontend displays next question:**
   - Renders question text from API response
   - No hardcoded text anywhere

## Key Benefits

✅ **Database-Driven**: Questions editable without code deployment  
✅ **AI-Assisted**: Gemini understands context and decides progression  
✅ **No Hardcoded Text**: Frontend only renders, never stores questions  
✅ **Backward Compatible**: Legacy code still works  
✅ **Future-Proof**: Supports A/B testing, multi-language, etc.

## Migration Steps

1. **Run database migration:**
   ```sql
   -- Execute: migrations/008_create_icp_questions_table.sql
   ```

2. **Seed initial questions:**
   - Migration includes sample data
   - Can edit in database directly

3. **Deploy backend:**
   - New routes automatically registered via manifest
   - Gemini API key required: `GEMINI_API_KEY`

4. **Update frontend:**
   - Already updated to use API
   - Falls back gracefully if API unavailable

## Testing

### Backend:
```bash
# Test fetching questions
curl http://localhost:3000/api/ai-icp-assistant/onboarding/icp-questions?category=lead_generation

# Test processing answer
curl -X POST http://localhost:3000/api/ai-icp-assistant/onboarding/icp-answer \
  -H "Content-Type: application/json" \
  -d '{"currentStepIndex": 1, "userAnswer": "Logistics companies"}'
```

### Frontend:
- Chat-based onboarding automatically uses API
- Form-based onboarding can be updated similarly

## Files Created/Modified

### Created:
- `migrations/008_create_icp_questions_table.sql`
- `backend/models/ICPQuestion.js`
- `backend/services/GeminiIntentService.js`
- `backend/controllers/ICPOnboardingController.js`
- `backend/routes/icpOnboarding.js` (added to index.js)
- `LAD-Frontend/web/src/lib/icpQuestionsApi.ts`

### Modified:
- `backend/routes/index.js` (added ICP onboarding routes)
- `backend/models/index.js` (exported ICPQuestion)
- `backend/manifest.js` (added icp_questions table)
- `LAD-Frontend/web/src/lib/icpQuestionsConfig.ts` (marked deprecated)
- `LAD-Frontend/web/src/components/onboarding/ChatStepController.tsx` (uses API)

## Next Steps

1. Update `GuidedFlowPanel.tsx` to fetch questions from API
2. Add admin UI for editing questions in database
3. Add A/B testing support (multiple question sets)
4. Add multi-language support (questions per language)

