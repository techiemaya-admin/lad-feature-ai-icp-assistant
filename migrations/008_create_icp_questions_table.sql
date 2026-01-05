-- Migration: ICP Questions Table
-- Description: Creates table to store ICP onboarding prompts/questions
-- Date: 2025-01-XX
-- 
-- This table is the single source of truth for all ICP questions.
-- Questions can be edited in the database without code changes.
-- Gemini API uses intent_key to understand user answers and decide next step.

-- ============================================================================
-- Helper Function: update_updated_at_column
-- ============================================================================
-- This function is used by triggers to automatically update the updated_at timestamp

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ICP Questions Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS icp_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_index INTEGER NOT NULL,              -- Ordering (1-7, or more)
  title TEXT,                               -- Optional title for the question
  question TEXT NOT NULL,                   -- Prompt text shown to user
  helper_text TEXT,                         -- Examples / hints / guidance
  category VARCHAR(100) DEFAULT 'lead_generation', -- e.g. 'lead_generation', 'outbound', 'inbound'
  intent_key VARCHAR(100) NOT NULL,         -- Semantic intent (e.g. 'ideal_customer', 'company_size', 'decision_maker')
  question_type VARCHAR(50) DEFAULT 'text', -- 'text', 'select', 'multi-select', 'boolean'
  options JSONB,                            -- For select/multi-select questions: [{"label": "...", "value": "..."}]
  validation_rules JSONB,                   -- Validation rules (e.g. {"minLength": 2, "required": true})
  is_active BOOLEAN DEFAULT true,            -- Can disable questions without deleting
  display_order INTEGER,                    -- For custom ordering within same step_index
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for icp_questions
CREATE INDEX idx_icp_questions_step_index ON icp_questions(step_index);
CREATE INDEX idx_icp_questions_category ON icp_questions(category);
CREATE INDEX idx_icp_questions_intent_key ON icp_questions(intent_key);
CREATE INDEX idx_icp_questions_is_active ON icp_questions(is_active);
CREATE INDEX idx_icp_questions_category_active ON icp_questions(category, is_active);
CREATE INDEX idx_icp_questions_step_display ON icp_questions(step_index, display_order);

-- Trigger for updated_at
CREATE TRIGGER update_icp_questions_updated_at
  BEFORE UPDATE ON icp_questions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE icp_questions IS 'Stores ICP onboarding prompts/questions - single source of truth for all ICP text';
COMMENT ON COLUMN icp_questions.step_index IS 'Ordering number (1-7 or more). Questions with same step_index can be shown together or sequentially.';
COMMENT ON COLUMN icp_questions.intent_key IS 'Semantic intent identifier used by Gemini to map user answers to next step (e.g. "ideal_customer", "company_size", "decision_maker")';
COMMENT ON COLUMN icp_questions.question_type IS 'Type of question: text, select, multi-select, boolean';
COMMENT ON COLUMN icp_questions.options IS 'JSON array of options for select/multi-select questions: [{"label": "Option 1", "value": "opt1"}]';
COMMENT ON COLUMN icp_questions.validation_rules IS 'JSON validation rules: {"minLength": 2, "required": true, "maxItems": 3}';
COMMENT ON COLUMN icp_questions.is_active IS 'Can disable questions without deleting - useful for A/B testing';

-- ============================================================================
-- Sample Data: Initial ICP Questions for Lead Generation
-- ============================================================================

INSERT INTO icp_questions (step_index, title, question, helper_text, category, intent_key, question_type, display_order) VALUES
(1, 'Best Customers', 'Who are your top 2–3 best customers?', 'Example: Logistics companies, SaaS founders, Real estate developers', 'lead_generation', 'ideal_customer', 'text', 1),
(2, 'Most Profitable', 'Which of them brought you the most profit overall?', 'Example: The client with repeat projects, not one-off work', 'lead_generation', 'profitability', 'text', 1),
(3, 'Easiest to Work With', 'Which one was the easiest to work with?', 'Example: Clear decision-maker, paid on time, respected your process', 'lead_generation', 'work_compatibility', 'text', 1),
(4, 'Company Size', 'What size was the company?', 'Example: 10–50 employees, 50–200 employees, 200+ employees', 'lead_generation', 'company_size', 'select', 1),
(5, 'Value Alignment', 'Did they already value your service, or did you have to convince them?', 'Example: They understood the value vs they only compared prices', 'lead_generation', 'value_alignment', 'select', 1),
(6, 'Problem Feeler', 'Who actually felt the problem you solved?', 'Example: Operations team struggling with delays', 'lead_generation', 'problem_feeler', 'text', 1),
(7, 'Decision Maker Role', 'What was that person''s role or title?', 'Example: Operations Manager, Founder, Finance Head', 'lead_generation', 'decision_maker_role', 'text', 1)
ON CONFLICT DO NOTHING;

-- Update company_size question with options
UPDATE icp_questions 
SET options = '[{"label": "10–50", "value": "10-50"}, {"label": "50–200", "value": "50-200"}, {"label": "200+", "value": "200+"}]'::jsonb
WHERE intent_key = 'company_size';

-- Update value_alignment question with options
UPDATE icp_questions 
SET options = '[{"label": "They already valued our service", "value": "valued"}, {"label": "We had to convince them", "value": "convinced"}]'::jsonb
WHERE intent_key = 'value_alignment';

