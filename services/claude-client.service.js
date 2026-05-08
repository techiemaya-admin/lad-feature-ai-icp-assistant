/**
 * Claude Client Service (Gemini primary · Claude fallback)
 *
 * Primary: Gemini (via gemini-client.service — full model chain)
 * Fallback: Claude (Anthropic) — used when all Gemini models fail
 *
 * Exposes the same interface as gemini-client.service.js so it is a drop-in replacement:
 *   generateContent(prompt)  → string
 *   generateContentWithSearch(prompt) → { text, sources }
 *   isAvailable() → boolean
 */
const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../utils/logger');

class ClaudeClientService {
  constructor() {
    this._initialized = false;
    this.client = null;
    this._claudeAvailable = false;
    this._model = null;
    this._gemini = null; // lazy-loaded primary
  }

  _initialize() {
    if (this._initialized) return;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      logger.warn('[ClaudeClientService] ANTHROPIC_API_KEY not set — Claude fallback unavailable');
    } else {
      try {
        this.client = new Anthropic({ apiKey });
        this._model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
        this._claudeAvailable = true;
        logger.info(`[ClaudeClientService] Anthropic SDK initialised (fallback model: ${this._model})`);
      } catch (err) {
        logger.error('[ClaudeClientService] Failed to initialise Anthropic SDK', { error: err.message });
      }
    }
    this._initialized = true;
  }

  _getGemini() {
    if (!this._gemini) {
      try {
        this._gemini = require('./gemini-client.service');
      } catch (err) {
        logger.warn('[ClaudeClientService] Gemini primary unavailable', { error: err.message });
        this._gemini = null;
      }
    }
    return this._gemini;
  }

  isAvailable() {
    this._initialize();
    const g = this._getGemini();
    if (g && g.isAvailable && g.isAvailable()) return true;
    return this._claudeAvailable;
  }

  /**
   * Call Gemini first (full model chain), fall back to Claude on failure.
   */
  async generateContent(prompt) {
    // ── Primary: Gemini (full model chain via gemini-client.service) ──────
    const gemini = this._getGemini();
    if (gemini) {
      try {
        return await gemini.generateContent(prompt);
      } catch (err) {
        logger.warn('[ClaudeClientService] Gemini chain exhausted — falling back to Claude', { error: err.message });
      }
    }

    // ── Fallback: Claude ──────────────────────────────────────────────────
    this._initialize();
    if (this._claudeAvailable) {
      try {
        const message = await this.client.messages.create({
          model:      this._model,
          max_tokens: 4096,
          messages:   [{ role: 'user', content: prompt }],
        });
        logger.info('[ClaudeClientService] Claude fallback succeeded');
        return message.content[0].text;
      } catch (err) {
        logger.warn('[ClaudeClientService] Claude fallback failed', { error: err.message });
        throw err;
      }
    }

    throw new Error('No LLM available: Gemini chain exhausted and Claude (ANTHROPIC_API_KEY) is unconfigured or failed.');
  }

  /**
   * Search-grounded generation — always uses Gemini (Google Search grounding
   * is Gemini-exclusive). Falls through to plain generateContent if unavailable.
   */
  async generateContentWithSearch(prompt) {
    const gemini = this._getGemini();
    if (gemini) {
      try {
        logger.debug('[ClaudeClientService] generateContentWithSearch — delegating to Gemini grounded search');
        return gemini.generateContentWithSearch(prompt);
      } catch (err) {
        logger.warn('[ClaudeClientService] Gemini grounded search failed — falling back to plain generation', { error: err.message });
      }
    }

    // Plain generation fallback (no sources)
    const text = await this.generateContent(prompt);
    return { text, sources: [] };
  }
}

module.exports = new ClaudeClientService();
