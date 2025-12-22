-- Migration: AI ICP Assistant Tables
-- Description: Creates tables for persisting AI conversations, messages, and ICP profiles
-- Date: 2025-12-22

-- ============================================================================
-- 1. AI Conversations Table
-- ============================================================================
-- Stores conversation sessions between users and the AI assistant

CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title VARCHAR(255), -- Optional title for the conversation
  status VARCHAR(50) DEFAULT 'active', -- active, archived, completed
  icp_data JSONB DEFAULT '{}', -- Extracted ICP parameters (industry, company_size, etc.)
  search_params JSONB, -- Final search parameters when ready to search
  search_triggered BOOLEAN DEFAULT false, -- Whether search was executed
  metadata JSONB DEFAULT '{}', -- Additional metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  archived_at TIMESTAMP
);

-- Indexes for ai_conversations
CREATE INDEX idx_ai_conversations_user_id ON ai_conversations(user_id);
CREATE INDEX idx_ai_conversations_organization_id ON ai_conversations(organization_id);
CREATE INDEX idx_ai_conversations_status ON ai_conversations(status);
CREATE INDEX idx_ai_conversations_created_at ON ai_conversations(created_at DESC);
CREATE INDEX idx_ai_conversations_user_org ON ai_conversations(user_id, organization_id);

-- Trigger for updated_at
CREATE TRIGGER update_ai_conversations_updated_at
  BEFORE UPDATE ON ai_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE ai_conversations IS 'Stores AI ICP Assistant conversation sessions';
COMMENT ON COLUMN ai_conversations.icp_data IS 'Extracted ICP parameters from conversation (industry, location, company_size, etc.)';
COMMENT ON COLUMN ai_conversations.search_params IS 'Apollo/search parameters built from ICP data';

-- ============================================================================
-- 2. AI Messages Table
-- ============================================================================
-- Stores individual messages within conversations

CREATE TABLE IF NOT EXISTS ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL, -- 'user' or 'assistant'
  content TEXT NOT NULL, -- The message content
  message_data JSONB DEFAULT '{}', -- Structured data (extracted parameters, suggestions, etc.)
  tokens_used INTEGER, -- Token count for this message (for billing)
  model VARCHAR(100), -- AI model used (gpt-4, claude-3, etc.)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for ai_messages
CREATE INDEX idx_ai_messages_conversation_id ON ai_messages(conversation_id);
CREATE INDEX idx_ai_messages_role ON ai_messages(role);
CREATE INDEX idx_ai_messages_created_at ON ai_messages(created_at);
CREATE INDEX idx_ai_messages_conversation_created ON ai_messages(conversation_id, created_at);

COMMENT ON TABLE ai_messages IS 'Individual messages in AI ICP Assistant conversations';
COMMENT ON COLUMN ai_messages.role IS 'Message sender: user or assistant';
COMMENT ON COLUMN ai_messages.message_data IS 'Structured data like extracted ICP parameters, suggestions, analysis';
COMMENT ON COLUMN ai_messages.tokens_used IS 'Token count for billing and usage tracking';

-- ============================================================================
-- 3. AI ICP Profiles Table
-- ============================================================================
-- Stores saved ICP configurations for reuse

CREATE TABLE IF NOT EXISTS ai_icp_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL, -- User-defined profile name
  description TEXT, -- Optional description
  icp_data JSONB NOT NULL, -- The ICP parameters
  search_params JSONB, -- Associated search parameters
  source_conversation_id UUID REFERENCES ai_conversations(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0, -- How many times this profile was used
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for ai_icp_profiles
CREATE INDEX idx_ai_icp_profiles_user_id ON ai_icp_profiles(user_id);
CREATE INDEX idx_ai_icp_profiles_organization_id ON ai_icp_profiles(organization_id);
CREATE INDEX idx_ai_icp_profiles_is_active ON ai_icp_profiles(is_active);
CREATE INDEX idx_ai_icp_profiles_usage_count ON ai_icp_profiles(usage_count DESC);
CREATE INDEX idx_ai_icp_profiles_user_org ON ai_icp_profiles(user_id, organization_id);
CREATE INDEX idx_ai_icp_profiles_name ON ai_icp_profiles(name);

-- Trigger for updated_at
CREATE TRIGGER update_ai_icp_profiles_updated_at
  BEFORE UPDATE ON ai_icp_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE ai_icp_profiles IS 'Saved ICP profiles for quick reuse';
COMMENT ON COLUMN ai_icp_profiles.icp_data IS 'ICP parameters (industry, company_size, location, technologies, etc.)';
COMMENT ON COLUMN ai_icp_profiles.source_conversation_id IS 'Original conversation that created this profile';
COMMENT ON COLUMN ai_icp_profiles.usage_count IS 'Number of times this profile was used for searches';

-- ============================================================================
-- 4. AI Keywords Expansion Cache (Optional - for performance)
-- ============================================================================
-- Caches keyword expansion results to reduce AI API calls

CREATE TABLE IF NOT EXISTS ai_keyword_expansions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_keyword VARCHAR(255) NOT NULL,
  expanded_keywords JSONB NOT NULL, -- Array of expanded keywords
  context VARCHAR(100), -- Context used (e.g., 'technology', 'industry', 'general')
  model VARCHAR(100), -- AI model used
  organization_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  usage_count INTEGER DEFAULT 1,
  last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for ai_keyword_expansions
CREATE INDEX idx_ai_keyword_expansions_original ON ai_keyword_expansions(original_keyword);
CREATE INDEX idx_ai_keyword_expansions_org ON ai_keyword_expansions(organization_id);
CREATE INDEX idx_ai_keyword_expansions_context ON ai_keyword_expansions(context);
CREATE UNIQUE INDEX idx_ai_keyword_unique ON ai_keyword_expansions(original_keyword, context, organization_id);

COMMENT ON TABLE ai_keyword_expansions IS 'Cache for AI-generated keyword expansions';
COMMENT ON COLUMN ai_keyword_expansions.expanded_keywords IS 'Array of expanded keyword variations';
COMMENT ON COLUMN ai_keyword_expansions.usage_count IS 'Cache hit count for performance monitoring';

-- ============================================================================
-- 5. Sample Data & Functions
-- ============================================================================

-- Function to get conversation summary
CREATE OR REPLACE FUNCTION get_conversation_summary(conv_id UUID)
RETURNS TABLE (
  conversation_id UUID,
  user_id UUID,
  message_count BIGINT,
  total_tokens INTEGER,
  status VARCHAR,
  created_at TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.user_id,
    COUNT(m.id) as message_count,
    COALESCE(SUM(m.tokens_used), 0)::INTEGER as total_tokens,
    c.status,
    c.created_at
  FROM ai_conversations c
  LEFT JOIN ai_messages m ON m.conversation_id = c.id
  WHERE c.id = conv_id
  GROUP BY c.id, c.user_id, c.status, c.created_at;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_conversation_summary IS 'Returns summary statistics for a conversation';

-- Function to increment profile usage
CREATE OR REPLACE FUNCTION increment_profile_usage(profile_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE ai_icp_profiles
  SET usage_count = usage_count + 1,
      last_used_at = CURRENT_TIMESTAMP
  WHERE id = profile_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_profile_usage IS 'Increments usage counter for ICP profile';

-- ============================================================================
-- 6. Grant Permissions (adjust based on your user roles)
-- ============================================================================

-- Grant permissions to application user (adjust username as needed)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ai_conversations TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ai_messages TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ai_icp_profiles TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ai_keyword_expansions TO your_app_user;

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- You can verify the migration with:
-- SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'ai_%';
