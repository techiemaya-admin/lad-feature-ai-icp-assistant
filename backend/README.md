# AI-ICP-Assistant Backend (v2.0.0)

## Architecture

This feature follows LAD's standard MVC architecture:

```
backend/
├── controllers/          # Business logic layer
│   └── AIAssistantController.js
├── models/              # Database models
│   ├── AIConversation.js
│   ├── AIMessage.js
│   ├── ICPProfile.js
│   ├── KeywordExpansion.js
│   └── index.js
├── middleware/          # Request validation
│   └── validation.js
├── routes/              # API endpoint definitions
│   └── index.js
├── services/            # Core AI processing
│   ├── AIAssistantService.js
│   └── mocks.js (for standalone testing)
└── manifest.js          # Feature registration
```

## Database Tables

The feature uses 4 tables (see `../migrations/007_create_ai_icp_assistant_tables.sql`):

1. **ai_conversations** - Conversation sessions
2. **ai_messages** - Individual messages
3. **ai_icp_profiles** - Saved ICP configurations
4. **ai_keyword_expansions** - Keyword cache

## API Endpoints

### Conversations
- `POST /api/ai-icp-assistant/chat` - Chat with AI
- `GET /api/ai-icp-assistant/history` - List conversations
- `GET /api/ai-icp-assistant/conversations/:id` - Get conversation details
- `POST /api/ai-icp-assistant/reset` - Reset/archive conversation

### Keywords
- `POST /api/ai-icp-assistant/expand-keywords` - Expand keywords (with cache)

### Profiles
- `GET /api/ai-icp-assistant/profiles` - List ICP profiles
- `POST /api/ai-icp-assistant/profiles` - Create profile
- `PUT /api/ai-icp-assistant/profiles/:id` - Update profile
- `DELETE /api/ai-icp-assistant/profiles/:id` - Delete profile
- `POST /api/ai-icp-assistant/profiles/:id/use` - Track usage

## Development

### Local Testing (Standalone)
The feature includes mocks for standalone testing without LAD dependencies:

```bash
# Start test server
npm start

# Run test client
npm test

# Open test UI
open test-ui.html
```

### Integration with LAD
When merging back to LAD, the mocks are replaced with real database connections.

See `REFACTORING_SUMMARY.md` for detailed architecture changes.
