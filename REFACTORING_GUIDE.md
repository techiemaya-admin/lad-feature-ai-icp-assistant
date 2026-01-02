# Architecture Refactoring Guide

## Status: IN PROGRESS

This guide documents the migration from flat architecture to feature-based architecture.

## Migration Steps

### Phase 1: Create Feature Structure ✅
- [x] Create `backend/features/ai-icp-assistant/` folder
- [x] Create subfolders: controllers, services, models, middleware, routes, config
- [x] Create config files for hardcoded values

### Phase 2: Extract Hardcoded Values ✅
- [x] Create `config/onboarding.config.js` - all platform names, step counts, options
- [x] Create `config/prompts.config.js` - all prompt templates
- [x] Create helper services: platform-handler, template-handler, platform-progression

### Phase 3: Split Large Files (IN PROGRESS)
- [ ] Split `ICPOnboardingController.js` (952 lines) → controller + services
- [ ] Split `GeminiIntentService.js` (1232 lines) → multiple focused services

### Phase 4: Move Files
- [ ] Move models to `features/ai-icp-assistant/models/`
- [ ] Move middleware to `features/ai-icp-assistant/middleware/`
- [ ] Update all imports

### Phase 5: Update Routes
- [ ] Consolidate routes into single file
- [ ] Update route paths
- [ ] Update main app to use feature routes

### Phase 6: Frontend Updates
- [ ] Rename hooks to generic names (useItem, useItems)
- [ ] Update imports

## File Mapping

### Backend
| Old Location | New Location | Status |
|------------|-------------|--------|
| `backend/controllers/ICPOnboardingController.js` | `backend/features/ai-icp-assistant/controllers/ai-icp-assistant.controller.js` | Pending |
| `backend/services/GeminiIntentService.js` | `backend/features/ai-icp-assistant/services/gemini-intent.service.js` | Pending |
| `backend/models/ICPQuestion.js` | `backend/features/ai-icp-assistant/models/ai-icp-assistant.model.js` | Pending |
| `backend/middleware/validation.js` | `backend/features/ai-icp-assistant/middleware/ai-icp-assistant.middleware.js` | Pending |
| `backend/routes/index.js` | `backend/features/ai-icp-assistant/routes/ai-icp-assistant.routes.js` | Pending |

## Breaking Changes

1. **Import paths** - All imports need to be updated
2. **Route paths** - May change if feature prefix is added
3. **Service instantiation** - Services now use dependency injection pattern

## Testing Checklist

- [ ] All API endpoints work
- [ ] ICP onboarding flow completes
- [ ] Platform selection works
- [ ] Template collection works
- [ ] Confirmation step shows correct data
- [ ] Frontend hooks work correctly

## Rollback Plan

If issues arise:
1. Keep old files in `backend/` as backup
2. Update imports to point back to old locations
3. Gradually migrate one service at a time

