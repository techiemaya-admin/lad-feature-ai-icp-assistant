-- Search prospect feedback: tracks per-lead user actions from the AI search panel
-- Covers all 6 modules (abm, signal_detection, competitor_intent, advanced_search)
CREATE TABLE IF NOT EXISTS lad_dev.search_prospect_feedback (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    session_id          TEXT,                          -- convId from frontend
    module_used         TEXT,                          -- abm | advanced_search | signal_detection | competitor_intent
    lead_profile_url    TEXT,                          -- LinkedIn URL (primary identifier)
    lead_name           TEXT,
    lead_headline       TEXT,
    lead_company        TEXT,
    lead_location       TEXT,
    feedback            TEXT CHECK (feedback IN ('good', 'bad', 'summary_generated')),
    include_in_campaign BOOLEAN DEFAULT NULL,          -- true=include, false=exclude, null=undecided
    summary_generated   BOOLEAN DEFAULT FALSE,
    summary_cost_credits INTEGER DEFAULT 0,
    feedback_comment    TEXT,                          -- reason when bad match
    raw_lead_data       JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, lead_profile_url, session_id)   -- one feedback per lead per session
);

CREATE INDEX IF NOT EXISTS idx_spf_tenant_session ON lad_dev.search_prospect_feedback (tenant_id, session_id);
CREATE INDEX IF NOT EXISTS idx_spf_tenant_feedback ON lad_dev.search_prospect_feedback (tenant_id, feedback);
CREATE INDEX IF NOT EXISTS idx_spf_include_campaign ON lad_dev.search_prospect_feedback (tenant_id, include_in_campaign) WHERE include_in_campaign IS NOT NULL;
