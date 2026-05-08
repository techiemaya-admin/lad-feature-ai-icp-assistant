/**
 * AI Client Service (DeepSeek primary · Gemini fallback · Claude fallback)
 *
 * generateContent()          — DeepSeek first, then Gemini chain, then Claude fallback.
 * generateContentWithSearch() — Gemini-only (Google Search grounding is Gemini-exclusive).
 * getModel()                 — raw Gemini model instance for Vision API callers.
 *
 * Model chain (tried in order):
 *   DeepSeek (deepseek-chat) as primary (cheapest & fastest)
 *   → gemini-2.0-flash → gemini-2.5-flash → gemini-1.5-flash → gemini-1.5-pro
 *   → Claude (claude-sonnet-4-5) as last resort
 *
 * Override primary model via AI_MODEL, GEMINI_MODEL, or DEEPSEEK_MODEL env vars.
 * Set DEEPSEEK_API_KEY and ANTHROPIC_API_KEY for fallbacks.
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

class GeminiClientService {
  constructor() {
    this._initialized = false;
    this.genAI = null;
    this.model = null;
    this._geminiAvailable = false;
  }

  /**
   * Ordered list of Gemini models to try, primary first.
   * Override primary via GEMINI_MODEL env var; the rest are always tried as fallbacks.
   * Chain is broad enough to survive any single-model outage or rate limit.
   */
  _geminiModelChain() {
    const primary = process.env.AI_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const defaults = [
      'gemini-2.5-flash',       // WORKING - prioritized after extensive testing
      'gemini-3.1-flash',       // latest (may be 404)
      'gemini-3.0-flash',       // newest (may be 404)
      'gemini-2.0-flash',       // proven (may be 404)
      'gemini-1.5-flash',       // stable fallback
      'gemini-1.5-pro',         // last Gemini resort
    ];
    // Put primary first, then the remaining defaults (deduped)
    return [primary, ...defaults.filter(m => m !== primary)];
  }

  /** Lazy-initialise the Gemini SDK (only needed as fallback or for Vision/Search). */
  _initialize() {
    if (this._initialized) return;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      logger.warn('[AIClient] GEMINI_API_KEY not set — Gemini unavailable (Claude will be used)');
      this._geminiAvailable = false;
      this._initialized = true;
      return;
    }
    try {
      this.genAI = new GoogleGenerativeAI(apiKey);
      // Initialize with primary model; others are instantiated on-demand during fallback
      const primaryModel = this._geminiModelChain()[0];
      this.model = this.genAI.getGenerativeModel({ model: primaryModel });
      this._geminiAvailable = true;
      logger.info(`[AIClient] Gemini initialized (fallback chain: ${this._geminiModelChain().join(' → ')})`);
    } catch (error) {
      logger.error('[AIClient] Failed to initialize Gemini:', error);
      this._geminiAvailable = false;
    }
    this._initialized = true;
  }

  /**
   * Generate content — Gemini primary (full model chain), Claude fallback.
   * Returns text only for backward compatibility.
   * @param {string} prompt
   * @param {object} [options]
   * @param {number} [options.maxTokens=2048] — override Claude max_tokens
   */
  async generateContent(prompt, options = {}) {
    const response = await this.generateContentWithTracking(prompt, options);
    // Return text only for backward compatibility
    return response.text;
  }

  /**
   * Generate content with token tracking (NEW)
   * Gemini primary (full model chain), Claude fallback.
   * @param {string} prompt
   * @param {object} [options]
   * @param {number} [options.maxTokens=2048] — override Claude max_tokens
   * @returns {Promise<Object>} { text, usage: {inputTokens, outputTokens, totalTokens}, model, provider }
   */
  async generateContentWithTracking(prompt, options = {}) {
    const maxTokens = options.maxTokens || parseInt(process.env.CLAUDE_MAX_TOKENS) || 2048;

    // ── Primary: DeepSeek (affordable & fast) ───────────────────────────────
    const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
    if (deepseekApiKey) {
      try {
        const response = await this._callDeepSeek(prompt, maxTokens, deepseekApiKey);
        logger.info('[AIClient] DeepSeek primary succeeded');
        return {
          text: response.text,
          usage: response.usage,
          model: response.model,
          provider: 'deepseek',
        };
      } catch (deepseekErr) {
        logger.warn('[AIClient] DeepSeek primary failed, falling back to Gemini', {
          error: deepseekErr.message
        });
      }
    }

    // ── Fallback 1: Gemini (full model chain) ────────────────────────────────
    this._initialize();
    if (this._geminiAvailable) {
      const modelChain = this._geminiModelChain();
      let lastGeminiError;
      for (const modelName of modelChain) {
        try {
          const model = this.genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent(prompt);
          const response = await result.response;
          if (modelName !== modelChain[0]) {
            logger.info(`[AIClient] Gemini succeeded with fallback model: ${modelName}`);
          }

          // Extract token usage from Gemini response
          const usageMetadata = response.usageMetadata || {};
          const inputTokens = usageMetadata.promptTokenCount || 0;
          const outputTokens = usageMetadata.candidatesTokenCount || 0;

          return {
            text: response.text(),
            usage: {
              inputTokens,
              outputTokens,
              totalTokens: inputTokens + outputTokens,
            },
            model: modelName,
            provider: 'gemini',
          };
        } catch (err) {
          logger.warn(`[AIClient] Gemini model ${modelName} failed: ${err.message}`);
          lastGeminiError = err;
        }
      }
      logger.warn('[AIClient] All Gemini models exhausted — falling back to Claude', {
        error: lastGeminiError?.message,
      });
    }

    // ── Fallback 2: Claude ──────────────────────────────────────────────────
    const claudeApiKey = process.env.ANTHROPIC_API_KEY;
    if (claudeApiKey) {
      try {
        const Anthropic = require('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey: claudeApiKey });
        const response = await client.messages.create({
          model:      process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
          max_tokens: maxTokens,
          messages:   [{ role: 'user', content: prompt }],
        });
        logger.info('[AIClient] Claude fallback succeeded');

        const inputTokens = response.usage?.input_tokens || 0;
        const outputTokens = response.usage?.output_tokens || 0;

        return {
          text: (response.content?.[0]?.text || '').trim(),
          usage: {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
          },
          model: response.model,
          provider: 'anthropic',
        };
      } catch (claudeErr) {
        logger.warn('[AIClient] Claude fallback also failed', { error: claudeErr.message });
      }
    }

    throw new Error('[AIClient] All AI backends exhausted (DeepSeek → Gemini → Claude). Check API keys and quotas.');
  }
  /**
   * Generate content with Google Search grounding (real-time web search)
   * Returns { text, sources: [{ title, url }] }
   * Falls back to regular generateContent if grounding fails.
   */
  async generateContentWithSearch(prompt) {
    this._initialize();
    if (!this._geminiAvailable) {
      throw new Error('Gemini API key not configured. Please set GEMINI_API_KEY in your .env file.');
    }
    try {
      // Walk the model chain — not all models support Google Search grounding
      const searchModelChain = process.env.GEMINI_SEARCH_MODEL
        ? [process.env.GEMINI_SEARCH_MODEL]
        : this._geminiModelChain();
      let result, lastSearchError;
      for (const modelName of searchModelChain) {
        try {
          const searchModel = this.genAI.getGenerativeModel({
            model: modelName,
            tools: [{ googleSearch: {} }],
          });
          result = await searchModel.generateContent(prompt);
          if (modelName !== searchModelChain[0]) {
            logger.info(`[AIClient] Gemini search succeeded with fallback model: ${modelName}`);
          }
          break;
        } catch (err) {
          logger.warn(`[AIClient] Gemini search model ${modelName} failed: ${err.message}`);
          lastSearchError = err;
        }
      }
      if (!result) throw lastSearchError;
      const response = result.response;
      const text = response.text();

      // Extract source URLs from grounding metadata
      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
      const rawChunks = groundingMetadata?.groundingChunks || [];
      const sources = rawChunks
        .map(chunk => ({
          title: chunk.web?.title || '',
          url: chunk.web?.uri || '',
        }))
        .filter(s => s.url && !s.url.startsWith('data:'));

      // Extract token usage
      const usageMetadata = response.usageMetadata || {};
      const inputTokens = usageMetadata.promptTokenCount || 0;
      const outputTokens = usageMetadata.candidatesTokenCount || 0;

      logger.info(`[GeminiClientService] Grounded search returned ${sources.length} source(s)`, {
        tokensUsed: inputTokens + outputTokens,
      });
      return {
        text,
        sources,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
        model: searchModelChain[0],
        provider: 'gemini',
      };
    } catch (error) {
      logger.warn('[GeminiClientService] Grounded search failed, falling back to standard generation:', error.message);
      // Graceful fallback — no sources available
      const result = await this.generateContentWithTracking(prompt);
      return {
        text: result.text,
        sources: [],
        usage: result.usage,
        model: result.model,
        provider: result.provider,
      };
    }
  }

  /**
   * Call DeepSeek API (OpenAI-compatible endpoint)
   * Uses the official DeepSeek API with deepseek-chat model
   */
  async _callDeepSeek(prompt, maxTokens, apiKey) {
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    const deepseekUrl = 'https://api.deepseek.com/chat/completions';

    try {
      const fetch = require('node-fetch');
      const response = await fetch(deepseekUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`DeepSeek API error: ${response.status} ${response.statusText} - ${errorData.error?.message || JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      const message = data.choices?.[0]?.message?.content || '';
      const usage = data.usage || {};

      return {
        text: message.trim(),
        usage: {
          inputTokens: usage.prompt_tokens || 0,
          outputTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0,
        },
        model,
      };
    } catch (error) {
      throw new Error(`[DeepSeek] ${error.message}`);
    }
  }

  /**
   * Get model instance (for advanced usage)
   */
  getModel() {
    this._initialize();
    return this.model;
  }
  /**
   * Returns true if at least one AI backend (Gemini, DeepSeek, or Claude) is available.
   * Used by callers that need to gate on AI availability.
   */
  isAvailable() {
    this._initialize();
    return !!(
      this._geminiAvailable ||
      process.env.DEEPSEEK_API_KEY ||
      process.env.ANTHROPIC_API_KEY
    );
  }
}
module.exports = new GeminiClientService();
