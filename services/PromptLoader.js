/**
 * PromptLoader
 *
 * Loads AI chat prompt templates from the `icp_questions_prompt` table
 * (category = 'ai_chat') and caches them in-memory for 5 minutes.
 *
 * Prompt templates use {{PLACEHOLDER}} markers which are replaced at call-time
 * by PromptLoader.build(intentKey, vars, fallback).
 *
 * If the DB is unavailable (cold start, network error) the caller-supplied
 * fallback string is returned transparently — zero downtime impact.
 */
const { query, schema } = require('../utils/database');
const logger = require('../utils/logger');

const CATEGORY = 'ai_chat';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

class PromptLoader {
  constructor() {
    this._cache = new Map();     // intent_key → { text, expiresAt }
    this._loadPromise = null;    // in-flight bulk load
    this._lastBulkLoad = 0;
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Return the raw template string for a key, or fallback if unavailable.
   * @param {string} intentKey
   * @param {string} fallback  Hardcoded default used when DB is unavailable
   */
  async get(intentKey, fallback = '') {
    try {
      await this._ensureLoaded();
      const entry = this._cache.get(intentKey);
      if (entry?.text) return entry.text;
    } catch (err) {
      logger.debug('[PromptLoader] DB unavailable, using fallback', { intentKey, error: err.message });
    }
    return fallback;
  }

  /**
   * Get template and replace {{KEY}} placeholders with values from `vars`.
   * @param {string} intentKey
   * @param {Object} vars  e.g. { MESSAGE: 'hello', HISTORY_CTX: '...' }
   * @param {string} fallback  Template used when DB returns nothing
   */
  async build(intentKey, vars = {}, fallback = '') {
    const template = await this.get(intentKey, fallback);
    return this._interpolate(template, vars);
  }

  /** Force a cache refresh (useful after editing prompts in DB) */
  async reload() {
    this._cache.clear();
    this._lastBulkLoad = 0;
    this._loadPromise = null;
    await this._bulkLoad();
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  async _ensureLoaded() {
    const now = Date.now();
    if (now - this._lastBulkLoad < CACHE_TTL_MS) return; // cache still valid

    // Coalesce concurrent callers into one DB round-trip
    if (!this._loadPromise) {
      this._loadPromise = this._bulkLoad().finally(() => {
        this._loadPromise = null;
      });
    }
    await this._loadPromise;
  }

  async _bulkLoad() {
    const sql = `
      SELECT intent_key, prompt_text
      FROM ${schema}.icp_questions_prompt
      WHERE category = $1 AND is_active = true
    `;
    const result = await query(sql, [CATEGORY]);
    const expiresAt = Date.now() + CACHE_TTL_MS;
    for (const row of result.rows) {
      this._cache.set(row.intent_key, { text: row.prompt_text, expiresAt });
    }
    this._lastBulkLoad = Date.now();
    logger.debug('[PromptLoader] Loaded prompts from DB', { count: result.rows.length, keys: result.rows.map(r => r.intent_key) });
  }

  _interpolate(template, vars) {
    // Only replace {{UPPER_CASE}} markers — preserves lowercase LinkedIn tokens like {{first_name}}
    return template.replace(/\{\{([A-Z][A-Z0-9_]*)\}\}/g, (_, key) => {
      const val = vars[key];
      return val !== undefined && val !== null ? String(val) : '';
    });
  }
}

module.exports = new PromptLoader();
