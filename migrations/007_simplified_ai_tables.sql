-- Migration: AI ICP Assistant Tables - Simplified for lad_dev schema
-- Description: Creates tables for AI conversations with proper references
-- Date: 2026-01-07

-- Set the schema
SET search_path TO lad_dev;

-- ============================================================================
-- 1. AI Conversations Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active',
  icp_data JSONB DEFAULT '{}',
  search_params JSONB,
  search_triggered BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  archived_at TIMESTAMP
);

-- ============================================================================
-- 2. AI Messages Table  
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  message_data JSONB DEFAULT '{}',
  tokens_used INTEGER,
  model VARCHAR(100),
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 3. AI ICP Profiles Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_icp_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  icp_data JSONB NOT NULL,
  search_params JSONB,
  source_conversation_id UUID REFERENCES ai_conversations(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP,
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 4. AI Keyword Expansions Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_keyword_expansions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_keyword VARCHAR(255) NOT NULL,
  expanded_keywords JSONB NOT NULL,
  context VARCHAR(100),
  model VARCHAR(100),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  usage_count INTEGER DEFAULT 1,
  last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 5. Create Indexes (tenant-first for multi-tenancy)
-- ============================================================================

-- AI Conversations indexes
CREATE INDEX IF NOT EXISTS idx_ai_conversations_tenant_id ON ai_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_tenant_user ON ai_conversations(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_tenant_status ON ai_conversations(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_tenant_created ON ai_conversations(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_is_deleted ON ai_conversations(is_deleted) WHERE is_deleted = false;

-- AI Messages indexes  
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_id ON ai_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_role ON ai_messages(role);
CREATE INDEX IF NOT EXISTS idx_ai_messages_created_at ON ai_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_created ON ai_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_messages_is_deleted ON ai_messages(is_deleted) WHERE is_deleted = false;

-- AI ICP Profiles indexes
CREATE INDEX IF NOT EXISTS idx_ai_icp_profiles_tenant_id ON ai_icp_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_icp_profiles_tenant_user ON ai_icp_profiles(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_ai_icp_profiles_tenant_active ON ai_icp_profiles(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ai_icp_profiles_tenant_usage ON ai_icp_profiles(tenant_id, usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_ai_icp_profiles_tenant_name ON ai_icp_profiles(tenant_id, name);
CREATE INDEX IF NOT EXISTS idx_ai_icp_profiles_is_deleted ON ai_icp_profiles(is_deleted) WHERE is_deleted = false;

-- AI Keyword Expansions indexes
CREATE INDEX IF NOT EXISTS idx_ai_keyword_expansions_tenant_keyword ON ai_keyword_expansions(tenant_id, original_keyword);
CREATE INDEX IF NOT EXISTS idx_ai_keyword_expansions_tenant_context ON ai_keyword_expansions(tenant_id, context);
CREATE INDEX IF NOT EXISTS idx_ai_keyword_expansions_tenant_usage ON ai_keyword_expansions(tenant_id, usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_ai_keyword_expansions_is_deleted ON ai_keyword_expansions(is_deleted) WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_keyword_unique ON ai_keyword_expansions(original_keyword, context, tenant_id) WHERE is_deleted = false;

-- ============================================================================
-- 6. Comments
-- ============================================================================

COMMENT ON TABLE ai_conversations IS 'Stores AI ICP Assistant conversation sessions';
COMMENT ON COLUMN ai_conversations.icp_data IS 'Extracted ICP parameters from conversation';
COMMENT ON COLUMN ai_conversations.search_params IS 'Apollo/search parameters built from ICP data';

COMMENT ON TABLE ai_messages IS 'Individual messages in AI ICP Assistant conversations';
COMMENT ON COLUMN ai_messages.role IS 'Message sender: user or assistant';
COMMENT ON COLUMN ai_messages.message_data IS 'Structured data like extracted ICP parameters';

COMMENT ON TABLE ai_icp_profiles IS 'Saved ICP profiles for quick reuse';
COMMENT ON COLUMN ai_icp_profiles.icp_data IS 'ICP parameters (industry, company_size, etc.)';
COMMENT ON COLUMN ai_icp_profiles.usage_count IS 'Number of times this profile was used';

COMMENT ON TABLE ai_keyword_expansions IS 'Cache for AI-generated keyword expansions';
COMMENT ON COLUMN ai_keyword_expansions.expanded_keywords IS 'Array of expanded keyword variations';