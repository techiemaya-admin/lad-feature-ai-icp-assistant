/**
 * AI ICP Assistant Model
 * 
 * Database access layer for ICP questions and onboarding data.
 * No business logic, no HTTP logic, no AI logic - only database queries.
 */
const { query } = require('../../utils/database');
const onboardingConfig = require('../config/onboarding.config');
class AICICPAssistantModel {
  /**
   * Get all active ICP questions for a category
   */
  static async findAllQuestions(category = null) {
    const categoryFilter = category || onboardingConfig.defaultCategory;
    const sql = `
      SELECT 
        id,
        ROW_NUMBER() OVER (ORDER BY intent_key) as "stepIndex",
        NULL as title,
        prompt_text as question,
        NULL as "helperText",
        category,
        intent_key as "intentKey",
        prompt_type as "questionType",
        NULL as options,
        '{"required": true}'::jsonb as "validationRules",
        is_active as "isActive",
        1 as "displayOrder"
      FROM ${process.env.DB_SCHEMA || 'public'}.icp_questions_prompt
      WHERE category = $1 
        AND is_active = true
      ORDER BY intent_key ASC
    `;
    const result = await query(sql, [categoryFilter]);
    return result.rows;
  }
  /**
   * Get question by step index
   */
  static async findQuestionByStepIndex(stepIndex, category = null) {
    const categoryFilter = category || onboardingConfig.defaultCategory;
    const sql = `
      WITH numbered_questions AS (
        SELECT 
          id,
          ROW_NUMBER() OVER (ORDER BY intent_key) as row_num,
          NULL as title,
          prompt_text as question,
          NULL as "helperText",
          category,
          intent_key as "intentKey",
          prompt_type as "questionType",
          NULL as options,
          '{"required": true}'::jsonb as "validationRules",
          is_active as "isActive",
          1 as "displayOrder"
        FROM ${process.env.DB_SCHEMA || 'public'}.icp_questions_prompt
        WHERE category = $2 AND is_active = true
      )
      SELECT * FROM numbered_questions
      WHERE row_num = $1
      LIMIT 1
    `;
    const result = await query(sql, [stepIndex, categoryFilter]);
    return result.rows[0] || null;
  }
  /**
   * Get question by intent key
   */
  static async findQuestionByIntentKey(intentKey, category = null) {
    const categoryFilter = category || onboardingConfig.defaultCategory;
    const sql = `
      SELECT 
        id,
        ROW_NUMBER() OVER (ORDER BY intent_key) as "stepIndex",
        NULL as title,
        prompt_text as question,
        NULL as "helperText",
        category,
        intent_key as "intentKey",
        prompt_type as "questionType",
        NULL as options,
        '{"required": true}'::jsonb as "validationRules",
        is_active as "isActive",
        1 as "displayOrder"
      FROM ${process.env.DB_SCHEMA || 'public'}.icp_questions_prompt
      WHERE intent_key = $1 
        AND category = $2
        AND is_active = true
      LIMIT 1
    `;
    const result = await query(sql, [intentKey, categoryFilter]);
    return result.rows[0] || null;
  }
  /**
   * Get total count of active questions
   */
  static async countQuestions(category = null) {
    const categoryFilter = category || onboardingConfig.defaultCategory;
    const sql = `
      SELECT COUNT(*) as count
      FROM ${process.env.DB_SCHEMA || 'public'}.icp_questions_prompt
      WHERE category = $1 AND is_active = true
    `;
    const result = await query(sql, [categoryFilter]);
    return parseInt(result.rows[0].count, 10);
  }
}
module.exports = AICICPAssistantModel;