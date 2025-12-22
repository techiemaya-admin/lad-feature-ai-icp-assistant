# AI ICP Assistant Feature

An intelligent AI assistant feature for Lead Acquisition & Development (LAD) platform that provides conversational ICP (Ideal Customer Profile) discovery and lead qualification.

## 🎯 Purpose

This feature provides:
- **Conversational AI**: Natural language interaction for lead discovery
- **ICP Assistant**: Helps define and refine Ideal Customer Profiles
- **Keyword Expansion**: AI-powered keyword suggestions for better targeting
- **Context-Aware Responses**: Maintains conversation history and context
- **Lead Qualification**: AI-assisted lead scoring and qualification

## 📁 Repository Structure

```
lad-feature-ai-icp-assistant/
├── backend/
│   ├── manifest.js           # Feature registration metadata
│   ├── routes/
│   │   └── routes.js         # API endpoints for AI assistant
│   ├── services/
│   │   └── AIAssistantService.js  # Core AI service logic
│   └── tests/                # Backend tests
│
├── frontend/
│   ├── sdk/                  # Reusable SDK for LAD-Frontend
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── aiICPAssistantService.ts
│   │   └── services/
│   │       └── mayaAIService.ts
│   ├── components/           # React components (if any)
│   └── hooks/                # Custom React hooks
│
├── docs/                     # Feature documentation
├── scripts/                  # Utility scripts
└── README.md                 # This file
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Access to LAD main repository
- Google Gemini API key (for AI functionality)

### Backend Setup

1. **Environment Variables**:
   ```bash
   GEMINI_API_KEY=your_gemini_api_key
   NODE_ENV=development
   ```

2. **Feature Registration**:
   The feature uses LAD's feature registry system. See `backend/manifest.js` for configuration.

3. **API Endpoints**:
   - `POST /api/ai-icp-assistant/chat` - Chat with AI assistant
   - `POST /api/ai-icp-assistant/expand-keywords` - Expand keywords using AI
   - `GET /api/ai-icp-assistant/history` - Get conversation history

### Frontend Setup

1. **Install in LAD-Frontend**:
   ```bash
   # The SDK is already integrated in LAD-Frontend/sdk/features/ai-icp-assistant/
   ```

2. **Usage Example**:
   ```typescript
   import { mayaAI } from '@/features/ai-icp-assistant';

   // Send a chat message
   const response = await mayaAI.chat(
     'Help me find companies in the fintech space',
     conversationHistory,
     searchResults
   );

   // Expand keywords
   const keywords = await mayaAI.expandKeywords('fintech startup');
   ```

## 🔄 Development Workflow

This repository follows the **LAD Feature Development Pattern**:

1. **Isolated Development**: Develop features independently in this repo
2. **Regular Syncing**: Merge changes to LAD main repository using provided scripts
3. **Testing**: Test in isolation before merging
4. **Documentation**: Keep docs updated with changes

### 👨‍💻 For Developers Adding Enhancements

See [DEVELOPER_PLAYBOOK.md](DEVELOPER_PLAYBOOK.md) for a complete guide with examples:
- Step-by-step feature enhancement walkthrough
- Real example: Adding AI-powered lead scoring
- Backend and frontend implementation patterns
- Testing procedures and best practices
- Code review checklist

### Merging to LAD Main Repository

See [MERGE_PIPELINE.md](MERGE_PIPELINE.md) for detailed instructions on:
- Manual merge process
- Automated GitHub Actions sync
- Testing strategy
- Rollback procedures

## 📋 API Reference

### Chat Endpoint

**POST** `/api/ai-icp-assistant/chat`

Send a message to the AI assistant and get a contextual response.

**Request Body**:
```json
{
  "message": "Help me find SaaS companies",
  "conversationHistory": [...],
  "searchResults": [...]
}
```

**Response**:
```json
{
  "success": true,
  "response": "I can help you find SaaS companies...",
  "conversationId": "uuid",
  "timestamp": "2025-12-22T12:00:00Z"
}
```

### Keyword Expansion

**POST** `/api/ai-icp-assistant/expand-keywords`

Expand a topic into related keywords for better search targeting.

**Request Body**:
```json
{
  "topic": "fintech startup"
}
```

**Response**:
```json
{
  "success": true,
  "keywords": [
    "financial technology",
    "digital banking",
    "payment processing",
    ...
  ]
}
```

## 🔧 Configuration

### Backend Configuration

Edit `backend/manifest.js`:

```javascript
module.exports = {
  name: 'ai-icp-assistant',
  version: '1.0.0',
  description: 'AI-powered ICP assistant for lead discovery',
  routes: require('./routes/routes'),
  dependencies: ['gemini-api']
};
```

### Frontend Configuration

The feature uses environment variables in LAD-Frontend:

```env
NEXT_PUBLIC_BACKEND_URL=https://your-backend-url
NEXT_PUBLIC_ENABLE_AI_ASSISTANT=true
```

## 🧪 Testing

### Backend Tests

```bash
cd backend
npm test
```

##**[DEVELOPER_PLAYBOOK.md](DEVELOPER_PLAYBOOK.md)** - Complete guide for adding features ⭐
- [MERGE_PIPELINE.md](MERGE_PIPELINE.md) - Merge workflow to LAD main repo
- [SETUP_GUIDE.md](SETUP_GUIDE.md) - GitHub Actions setup instructions
- [UPGRADE_NOTES.md](backend/UPGRADE_NOTES.md) - Migration and upgrade notes
- [SDK README](frontend/sdk/README.md) - Frontend SDK documentation
cd frontend
npm test
```

## 📚 Documentation

- [UPGRADE_NOTES.md](backend/UPGRADE_NOTES.md) - Migration and upgrade notes
- [SDK README](frontend/sdk/README.md) - Frontend SDK documentation
- [MERGE_PIPELINE.md](MERGE_PIPELINE.md) - Merge workflow to LAD main repo

## 🤝 Contributing

This repository is for isolated feature development. To contribute:

1. Create a feature branch: `git checkout -b feature/your-enhancement`
2. Make your changes following LAD coding standards
3. Test thoroughly
4. Create a pull request
5. After approval, use merge scripts to sync to LAD main repo

### Coding Standards

- **File Size**: Maximum 400 lines per file (LAD standard)
- **Documentation**: JSDoc comments for all functions
- **Error Handling**: Comprehensive error handling with proper logging
- **TypeScript**: Use TypeScript for frontend code
- **Async/Await**: Prefer async/await over promises

## 🔐 Security Considerations

- Never commit API keys or secrets
- Use environment variables for configuration
- Validate all user inputs
- Implement rate limiting on API endpoints
- Secure conversation history storage

## 📄 License

Part of the LAD platform. See main repository for license information.

## 👥 Team

This feature is maintained by the LAD development team.

## 🔗 Links

- **LAD Backend**: https://github.com/techiemaya-admin/LAD-Backend
- **LAD Frontend**: https://github.com/techiemaya-admin/LAD-Frontend
- **Feature Repository**: https://github.com/techiemaya-admin/lad-feature-ai-icp-assistant

---

**Last Updated**: December 22, 2025
**Feature Version**: 1.0.0
**LAD Compliance**: ✅ Verified
