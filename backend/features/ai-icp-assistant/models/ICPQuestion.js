/**
 * ICP Question Model
 * 
 * Database model for ICP onboarding questions.
 * All ICP prompts are stored in the database - no hardcoded text.
 */

const { query } = require('../utils/database');

class ICPQuestion {
  /**
   * Get all active ICP questions for a category, ordered by step_index
   * @param {string} category - Category filter (e.g. 'lead_generation')
   * @returns {Promise<Array>} Array of ICP questions
   */
  static async findAll(category = 'lead_generation') {
    // Map existing icp_questions_prompt table to expected structure
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
    
    const result = await query(sql, [category]);
    return result.rows;
  }

  /**
   * Get a specific question by ID
   * @param {string} id - Question UUID
   * @returns {Promise<Object|null>} Question object or null
   */
  static async findById(id) {
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
      WHERE id = $1
    `;
    
    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  /**
   * Get question by step_index and category
   * @param {number} stepIndex - Step index (1-7)
   * @param {string} category - Category filter
   * @returns {Promise<Object|null>} Question object or null
   */
  static async findByStepIndex(stepIndex, category = 'lead_generation') {
    // Map step_index to row number based on intent_key order
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
    
    const result = await query(sql, [stepIndex, category]);
    return result.rows[0] || null;
  }

  /**
   * Get question by intent_key
   * @param {string} intentKey - Intent key (e.g. 'ideal_customer')
   * @param {string} category - Category filter
   * @returns {Promise<Object|null>} Question object or null
   */
  static async findByIntentKey(intentKey, category = 'lead_generation') {
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
    
    const result = await query(sql, [intentKey, category]);
    return result.rows[0] || null;
  }

  /**
   * Get total number of active questions for a category
   * @param {string} category - Category filter
   * @returns {Promise<number>} Total count
   */
  static async count(category = 'lead_generation') {
    const sql = `
      SELECT COUNT(*) as count
      FROM ${process.env.DB_SCHEMA || 'public'}.icp_questions_prompt
      WHERE category = $1 AND is_active = true
    `;
    
    const result = await query(sql, [category]);
    return parseInt(result.rows[0].count, 10);
  }
}

module.exports = ICPQuestion;

