/**
 * AI ICP Assistant Feature
 * 
 * AI-powered assistant for ICP (Ideal Customer Profile) onboarding and campaign setup.
 * Follows feature-based architecture with strict separation of concerns.
 */

## Architecture

### Folder Structure

```
backend/features/ai-icp-assistant/
├── controllers/
│   └── ai-icp-assistant.controller.js    # HTTP request/response only
├── services/
│   ├── ai-icp-assistant.service.js      # Main orchestrator (263 lines)
│   ├── step-processor.service.js        # Step-specific processing (308 lines)
│   ├── template-processor.service.js    # Template processing (142 lines)
│   ├── question-generator.service.js    # Question generation
│   ├── intent-analyzer.service.js       # AI intent analysis
│   ├── platform-progression.service.js  # Platform flow management
│   ├── template-handler.service.js      # Template management
│   └── [other services...]
├── models/
│   └── ai-icp-assistant.model.js        # Database access only
├── middleware/
│   └── ai-icp-assistant.middleware.js   # Validation/guards
├── routes/
│   └── ai-icp-assistant.routes.js       # Route definitions only
├── config/
│   ├── onboarding.config.js             # Platform/step configuration
│   ├── prompts.config.js                # Prompt templates
│   └── steps.config.js                  # Step index constants
├── manifest.js                          # Feature metadata
└── README.md
```

## Design Principles

### ✅ Single Responsibility
- **Controllers**: HTTP request/response only
- **Services**: Pure business logic, stateless
- **Models**: Database queries only
- **Middleware**: Validation/guards only
- **Routes**: Endpoint definitions only

### ✅ No Hardcoded Values
- All URLs from environment variables
- All step indices from `steps.config.js`
- All platform names from `onboarding.config.js`
- All prompts from `prompts.config.js`

### ✅ File Size Limits
- All files under 480 lines
- Large services split into focused modules

## API Endpoints

- `GET /api/ai-icp-assistant/onboarding/icp-questions` - Get all questions
- `GET /api/ai-icp-assistant/onboarding/icp-questions/:stepIndex` - Get specific question
- `POST /api/ai-icp-assistant/onboarding/icp-answer` - Process answer

## Environment Variables

- `GEMINI_API_KEY` - Google Generative AI API key (required)
- `GEMINI_MODEL` - Model name (default: gemini-2.5-flash)
- `ICP_TOTAL_STEPS` - Total onboarding steps (default: 11)
- `ICP_MAX_STEP_INDEX` - Maximum step index (default: 11)
- `ICP_CREDITS_PER_MESSAGE` - Credit cost per message (default: 0.1)
- `ICP_FEATURE_ENABLED` - Feature flag (default: true)
- `ICP_USE_GEMINI` - Use Gemini AI (default: true)
- `ICP_DEFAULT_CATEGORY` - Default category (default: lead_generation)

## Dependencies

- `@google/generative-ai` - Gemini API client
- `express` - Web framework
- `uuid` - UUID generation
