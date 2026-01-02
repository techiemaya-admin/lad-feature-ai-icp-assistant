# Architecture Compliance Analysis

## ❌ CRITICAL VIOLATIONS FOUND

The `lad-feature-ai-icp-assistant` folder **DOES NOT** follow the mandatory feature-based architecture.

---

## 📁 STRUCTURE VIOLATIONS

### Backend Structure Issues

**Current Structure:**
```
backend/
├── controllers/
├── services/
├── models/
├── middleware/
├── routes/
├── manifest.js
└── README.md
```

**Required Structure:**
```
backend/features/ai-icp-assistant/
├── controllers/
│   └── ai-icp-assistant.controller.js
├── services/
│   └── ai-icp-assistant.service.js
├── models/
│   └── ai-icp-assistant.model.js
├── middleware/
│   └── ai-icp-assistant.middleware.js
├── routes/
│   └── ai-icp-assistant.routes.js
├── manifest.js
└── README.md
```

**Issues:**
1. ❌ Missing `features/` folder layer
2. ❌ Missing `ai-icp-assistant/` feature folder
3. ❌ Files not named with feature prefix (e.g., `ICPOnboardingController.js` should be `ai-icp-assistant.controller.js`)
4. ❌ Multiple controllers in one feature (`AIAssistantController.js` + `ICPOnboardingController.js`)
5. ❌ Routes split across multiple files (`index.js` + `icpOnboarding.js`)

### Frontend Structure Issues

**Current Structure:**
```
frontend/sdk/features/ai-icp-assistant/
├── api.ts ✅
├── hooks.ts ✅
├── hooks/
│   ├── useICPQuestionByStep.ts
│   └── useICPQuestions.ts
├── types.ts ✅
└── index.ts ✅
```

**Required Structure:**
```
frontend/sdk/features/ai-icp-assistant/
├── api.ts ✅
├── hooks.ts ✅
├── hooks/
│   ├── useItem.ts (should be generic)
│   └── useItems.ts (should be generic)
├── types.ts ✅
└── index.ts ✅
```

**Issues:**
1. ⚠️ Hook naming not generic (`useICPQuestionByStep.ts` vs `useItem.ts`)
2. ⚠️ Missing generic `useItems.ts` hook

---

## 🔴 HARDCODED VALUES FOUND

### 1. Hardcoded Step Counts
**File:** `backend/controllers/ICPOnboardingController.js`
```javascript
const totalSteps = 11; // ❌ HARDCODED
if (currentStepIndex < 1 || currentStepIndex > 9) { // ❌ HARDCODED
```

### 2. Hardcoded Platform Names
**File:** `backend/services/GeminiIntentService.js`
```javascript
'LinkedIn', 'Email', 'WhatsApp', 'Voice Calls' // ❌ HARDCODED
if (pLower.includes('linkedin')) return 'linkedin'; // ❌ HARDCODED
if (pLower.includes('email')) return 'email'; // ❌ HARDCODED
if (pLower.includes('whatsapp')) return 'whatsapp'; // ❌ HARDCODED
if (pLower.includes('voice')) return 'voice'; // ❌ HARDCODED
```

### 3. Hardcoded Prompts
**File:** `backend/services/GeminiIntentService.js`
```javascript
prompt: 'Which platforms do you want to use for outreach?\n\nOptions:\n• LinkedIn\n• Email\n• WhatsApp\n• Voice Calls\n\nYou can select one or more.' // ❌ HARDCODED
```

---

## 📏 FILE SIZE VIOLATIONS

### Files Exceeding 460 Lines

1. **`backend/controllers/ICPOnboardingController.js`** - **952 lines** ❌
   - Should be split into:
     - `ai-icp-assistant.controller.js` (main controller)
     - `icp-onboarding.controller.js` (onboarding-specific)
     - Or extract logic to services

2. **`backend/services/GeminiIntentService.js`** - **1232 lines** ❌
   - Should be split into:
     - `gemini-intent.service.js` (core intent detection)
     - `gemini-question-generator.service.js` (question generation)
     - `gemini-platform-handler.service.js` (platform-specific logic)

---

## 🏗️ ARCHITECTURE VIOLATIONS

### 1. Controller Contains Business Logic
**File:** `backend/controllers/ICPOnboardingController.js`
- Lines 200-400: Complex business logic for platform completion tracking
- Lines 400-500: Template collection logic
- **Should be in services**

### 2. Service Contains HTTP Logic
**File:** `backend/services/GeminiIntentService.js`
- Contains Express request/response handling
- **Should only contain business logic**

### 3. Missing Feature Isolation
- Controllers import services directly (should use dependency injection)
- No feature boundaries enforced
- Cross-feature imports possible

### 4. Routes Not Feature-Scoped
**File:** `backend/routes/index.js`
- Routes defined at root level
- Should be in `features/ai-icp-assistant/routes/`

---

## ✅ WHAT'S CORRECT

1. ✅ Frontend SDK structure mostly correct
2. ✅ `manifest.js` exists and has metadata
3. ✅ Models separated from controllers
4. ✅ Middleware exists for validation
5. ✅ No hardcoded URLs in frontend (uses env vars)
6. ✅ Types properly defined in frontend

---

## 🔧 REQUIRED REFACTORING

### Priority 1: Structure Reorganization
1. Create `backend/features/ai-icp-assistant/` folder
2. Move all backend files into feature folder
3. Rename files with feature prefix
4. Consolidate controllers into single file
5. Consolidate routes into single file

### Priority 2: Remove Hardcoded Values
1. Extract step counts to config
2. Extract platform names to config/enum
3. Move prompts to config or database
4. Use dependency injection for services

### Priority 3: Split Large Files
1. Split `ICPOnboardingController.js` (952 lines)
2. Split `GeminiIntentService.js` (1232 lines)
3. Extract helper functions to separate modules

### Priority 4: Fix Architecture
1. Move business logic from controllers to services
2. Remove HTTP logic from services
3. Add dependency injection
4. Enforce feature boundaries

---

## 📊 COMPLIANCE SCORE

| Category | Status | Score |
|----------|--------|-------|
| Folder Structure | ❌ | 0/10 |
| File Naming | ❌ | 2/10 |
| No Hardcoded Values | ❌ | 3/10 |
| File Size Limits | ❌ | 0/10 |
| Separation of Concerns | ⚠️ | 5/10 |
| Feature Isolation | ❌ | 2/10 |
| **TOTAL** | **❌** | **12/60 (20%)** |

---

## 🎯 RECOMMENDATION

**Status: NON-COMPLIANT**

The feature requires **complete refactoring** to meet the mandatory architecture standards. The current structure is a legacy flat architecture that needs to be migrated to the feature-based structure.

**Estimated Effort:** 3-5 days for full refactoring

**Risk Level:** HIGH - Breaking changes required

