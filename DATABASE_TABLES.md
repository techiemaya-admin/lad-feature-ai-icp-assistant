# AI ICP Assistant - Database Tables Reference

## Overview
This feature uses **5 main database tables** in the `lad_dev` schema.

---

## 📊 Complete List of Tables

### Backend Tables (5 tables)

| # | Table Name | Purpose | Migration |
|---|------------|---------|-----------|
| 1 | `ai_conversations` | Stores conversation sessions between users and AI | `007_create_ai_icp_assistant_tables.sql` |
| 2 | `ai_messages` | Stores individual messages within conversations | `007_create_ai_icp_assistant_tables.sql` |
| 3 | `ai_icp_profiles` | Stores saved ICP configurations for reuse | `007_create_ai_icp_assistant_tables.sql` |
| 4 | `ai_keyword_expansions` | Caches keyword expansion results | `007_create_ai_icp_assistant_tables.sql` |
| 5 | `icp_questions` | Stores ICP onboarding questions (database-driven) | `008_create_icp_questions_table.sql` |

### Referenced External Tables (2 tables)
These tables must exist in LAD core/shared:

| Table Name | Purpose | Used For |
|------------|---------|----------|
| `users` | User accounts | Foreign key reference in conversations/profiles |
| `tenants` | Organization/tenant accounts | Foreign key reference for multi-tenancy |

---

## 📝 Detailed Table Schemas

### 1. **ai_conversations**
Stores AI assistant conversation sessions.

**Columns:**
- `id` (UUID, PK) - Unique conversation identifier
- `user_id` (UUID, FK → users.id) - User who owns the conversation
- `organization_id` (UUID, FK → tenants.id) - Organization/tenant
- `title` (VARCHAR) - Optional conversation title
- `status` (VARCHAR) - 'active', 'archived', 'completed'
- `icp_data` (JSONB) - Extracted ICP parameters
- `search_params` (JSONB) - Final search parameters
- `search_triggered` (BOOLEAN) - Whether search was executed
- `metadata` (JSONB) - Additional metadata
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)
- `archived_at` (TIMESTAMP)

**Indexes:**
- `idx_ai_conversations_user_id`
- `idx_ai_conversations_organization_id`
- `idx_ai_conversations_status`
- `idx_ai_conversations_created_at`
- `idx_ai_conversations_user_org`

**Used By:**
- `AIConversation.js` model
- Chat endpoint (`/chat`)
- History endpoint (`/history`)

---

### 2. **ai_messages**
Stores individual messages in conversations.

**Columns:**
- `id` (UUID, PK) - Unique message identifier
- `conversation_id` (UUID, FK → ai_conversations.id) - Parent conversation
- `role` (VARCHAR) - 'user' or 'assistant'
- `content` (TEXT) - Message content
- `message_data` (JSONB) - Structured data (parameters, suggestions)
- `tokens_used` (INTEGER) - Token count for billing
- `model` (VARCHAR) - AI model used (e.g., 'gemini-2.0-flash')
- `created_at` (TIMESTAMP)

**Indexes:**
- `idx_ai_messages_conversation_id`
- `idx_ai_messages_role`
- `idx_ai_messages_created_at`
- `idx_ai_messages_conversation_created`

**Used By:**
- `AIMessage.js` model
- Chat endpoint (`/chat`)
- Conversation detail endpoint (`/conversations/:id`)

---

### 3. **ai_icp_profiles**
Stores saved ICP profiles for reuse.

**Columns:**
- `id` (UUID, PK) - Unique profile identifier
- `user_id` (UUID, FK → users.id) - Profile owner
- `organization_id` (UUID, FK → tenants.id) - Organization/tenant
- `name` (VARCHAR) - User-defined profile name
- `description` (TEXT) - Optional description
- `icp_data` (JSONB) - ICP parameters (industries, roles, company size, etc.)
- `search_params` (JSONB) - Associated search parameters
- `source_conversation_id` (UUID, FK → ai_conversations.id) - Original conversation
- `is_active` (BOOLEAN) - Active status
- `usage_count` (INTEGER) - Times profile was used
- `last_used_at` (TIMESTAMP)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

**Indexes:**
- `idx_ai_icp_profiles_user_id`
- `idx_ai_icp_profiles_organization_id`
- `idx_ai_icp_profiles_is_active`
- `idx_ai_icp_profiles_usage_count`
- `idx_ai_icp_profiles_user_org`
- `idx_ai_icp_profiles_name`

**Used By:**
- `ICPProfile.js` model
- Profiles CRUD endpoints (`/profiles`, `/profiles/:id`)
- Profile usage endpoint (`/profiles/:id/use`)

---

### 4. **ai_keyword_expansions**
Caches AI-generated keyword expansions.

**Columns:**
- `id` (UUID, PK) - Unique expansion identifier
- `original_keyword` (VARCHAR) - Original keyword/topic
- `expanded_keywords` (JSONB) - Array of expanded keywords
- `context` (VARCHAR) - Context used (e.g., 'technology', 'industry')
- `model` (VARCHAR) - AI model used
- `organization_id` (UUID, FK → tenants.id) - Organization/tenant
- `usage_count` (INTEGER) - Cache hit count
- `last_used_at` (TIMESTAMP)
- `created_at` (TIMESTAMP)

**Indexes:**
- `idx_ai_keyword_expansions_original`
- `idx_ai_keyword_expansions_org`
- `idx_ai_keyword_expansions_context`
- `idx_ai_keyword_unique` (UNIQUE: original_keyword, context, organization_id)

**Used By:**
- `KeywordExpansion.js` model
- Keyword expansion endpoint (`/expand-keywords`)

---

### 5. **icp_questions**
Database-driven ICP onboarding questions (NEW).

**Columns:**
- `id` (UUID, PK) - Unique question identifier
- `step_index` (INTEGER) - Question ordering (1-7+)
- `title` (TEXT) - Optional question title
- `question` (TEXT) - Prompt text shown to user
- `helper_text` (TEXT) - Examples/hints/guidance
- `category` (VARCHAR) - e.g., 'lead_generation', 'outbound', 'inbound'
- `intent_key` (VARCHAR) - Semantic intent (e.g., 'ideal_customer', 'company_size')
- `question_type` (VARCHAR) - 'text', 'select', 'multi-select', 'boolean'
- `options` (JSONB) - Options for select/multi-select questions
- `validation_rules` (JSONB) - Validation rules
- `is_active` (BOOLEAN) - Active status
- `display_order` (INTEGER) - Custom ordering
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

**Indexes:**
- `idx_icp_questions_step_index`
- `idx_icp_questions_category`
- `idx_icp_questions_intent_key`
- `idx_icp_questions_is_active`
- `idx_icp_questions_category_active`
- `idx_icp_questions_step_display`

**Used By:**
- `ICPQuestion.js` model
- `ai-icp-assistant.model.js` model
- Onboarding endpoints (`/onboarding/icp-questions`, `/onboarding/icp-answer`)

---

## 🔧 Database Functions

### Helper Functions (from migrations)

1. **`update_updated_at_column()`**
   - Updates `updated_at` timestamp automatically
   - Used by triggers on multiple tables

2. **`get_conversation_summary(conv_id UUID)`**
   - Returns conversation statistics
   - Returns: conversation_id, user_id, message_count, total_tokens, status, created_at

3. **`increment_profile_usage(profile_id UUID)`**
   - Increments usage counter for ICP profile
   - Updates `usage_count` and `last_used_at`

---

## 🚀 Migration Files

### 007_create_ai_icp_assistant_tables.sql
Creates 4 core tables:
- ✅ `ai_conversations`
- ✅ `ai_messages`
- ✅ `ai_icp_profiles`
- ✅ `ai_keyword_expansions`

**Run with:**
```bash
node scripts/run-migration.js migrations/007_create_ai_icp_assistant_tables.sql
```

### 008_create_icp_questions_table.sql
Creates 1 table:
- ✅ `icp_questions`

**Includes 7 sample questions for lead generation**

**Run with:**
```bash
node scripts/run-migration.js migrations/008_create_icp_questions_table.sql
```

---

## 📊 Table Relationships

```
users (LAD core)
  ↓ (FK: user_id)
  ├─→ ai_conversations
  │     ↓ (FK: conversation_id)
  │     └─→ ai_messages
  │
  └─→ ai_icp_profiles
        ↑ (FK: source_conversation_id)
        └─── ai_conversations

tenants (LAD core)
  ↓ (FK: organization_id)
  ├─→ ai_conversations
  ├─→ ai_icp_profiles
  └─→ ai_keyword_expansions

icp_questions (standalone - no FK relationships)
```

---

## 🎯 Frontend/SDK Usage

The frontend SDK (`frontend/sdk/features/ai-icp-assistant/`) interacts with these tables through API endpoints:

### API Endpoints → Tables Mapping

| Endpoint | HTTP | Tables Used |
|----------|------|-------------|
| `/chat` | POST | `ai_conversations`, `ai_messages` |
| `/history` | GET | `ai_conversations` |
| `/conversations/:id` | GET | `ai_conversations`, `ai_messages` |
| `/reset` | POST | `ai_conversations` |
| `/profiles` | GET | `ai_icp_profiles` |
| `/profiles` | POST | `ai_icp_profiles` |
| `/profiles/:id` | PUT | `ai_icp_profiles` |
| `/profiles/:id` | DELETE | `ai_icp_profiles` |
| `/profiles/:id/use` | POST | `ai_icp_profiles` |
| `/expand-keywords` | POST | `ai_keyword_expansions` |
| `/onboarding/icp-questions` | GET | `icp_questions` |
| `/onboarding/icp-questions/:stepIndex` | GET | `icp_questions` |
| `/onboarding/icp-answer` | POST | `icp_questions` |

---

## 📝 Sample Queries

### Check if tables exist:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'lad_dev' 
  AND table_name IN (
    'ai_conversations',
    'ai_messages',
    'ai_icp_profiles',
    'ai_keyword_expansions',
    'icp_questions'
  )
ORDER BY table_name;
```

### Count records in each table:
```sql
SELECT 
  'ai_conversations' as table_name, COUNT(*) as count FROM lad_dev.ai_conversations
UNION ALL
SELECT 'ai_messages', COUNT(*) FROM lad_dev.ai_messages
UNION ALL
SELECT 'ai_icp_profiles', COUNT(*) FROM lad_dev.ai_icp_profiles
UNION ALL
SELECT 'ai_keyword_expansions', COUNT(*) FROM lad_dev.ai_keyword_expansions
UNION ALL
SELECT 'icp_questions', COUNT(*) FROM lad_dev.icp_questions;
```

### Get active ICP questions:
```sql
SELECT step_index, question, intent_key, question_type
FROM lad_dev.icp_questions
WHERE is_active = true
ORDER BY step_index, display_order;
```

---

## ⚠️ Important Notes

1. **Schema**: All tables are in the `lad_dev` schema
2. **Multi-tenancy**: Tables are scoped by `organization_id` (tenant)
3. **Soft Deletes**: Use `is_active` flag instead of DELETE
4. **Foreign Keys**: Require `users` and `tenants` tables from LAD core
5. **JSONB Fields**: Used for flexible data storage (icp_data, metadata, options)
6. **Timestamps**: All tables have `created_at`, many have `updated_at`

---

## 🔗 Model Files Reference

| Table | Model File(s) |
|-------|---------------|
| `ai_conversations` | `backend/features/ai-icp-assistant/models/AIConversation.js` |
| `ai_messages` | `backend/features/ai-icp-assistant/models/AIMessage.js` |
| `ai_icp_profiles` | `backend/features/ai-icp-assistant/models/ICPProfile.js` |
| `ai_keyword_expansions` | `backend/features/ai-icp-assistant/models/KeywordExpansion.js` |
| `icp_questions` | `backend/features/ai-icp-assistant/models/ICPQuestion.js`<br/>`backend/features/ai-icp-assistant/models/ai-icp-assistant.model.js` |

---

## ✅ Summary

- **Total Tables**: 5
- **Total Migrations**: 2
- **Total Indexes**: 28+
- **Total Functions**: 3
- **Schema**: `lad_dev`
- **External Dependencies**: `users`, `tenants` tables

All tables follow LAD architecture principles:
- ✅ Multi-tenancy ready
- ✅ UUID primary keys
- ✅ Proper indexing
- ✅ JSONB for flexibility
- ✅ Timestamps for auditing
- ✅ Foreign key constraints
