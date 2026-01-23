/**
 * AI ICP Assistant Controller
 * 
 * Handles business logic for AI conversations, ICP profiles, and keyword expansion
 */
const {
  AIConversationRepository,
  AIMessageRepository,
  ICPProfileRepository,
  KeywordExpansionRepository
} = require('../repositories');
const AIAssistantService = require('../services/AIAssistantService');
const logger = require('../utils/logger');
class AIAssistantController {
  /**
   * Chat with AI Assistant - Phase 1: Intent Understanding
   * POST /api/ai-icp-assistant/chat
   */
  static async chat(req, res) {
    try {
      const { message, conversationId = null, searchResults = [] } = req.body;
      const userId = req.user?.userId;
      const tenantId = req.user?.tenantId;
      // Get or create conversation
      let conversation;
      let isNewConversation = false;
      if (conversationId) {
        conversation = await AIConversationRepository.findById(conversationId, tenantId);
        if (!conversation || conversation.user_id !== userId) {
          return res.status(404).json({
            success: false,
            error: 'Conversation not found'
          });
        }
      } else {
        // Get active conversations and use first one or create new
        const activeConversations = await AIConversationRepository.findByUser(userId, tenantId, {
          status: 'active',
          limit: 1
        });
        if (activeConversations.length > 0) {
          conversation = activeConversations[0];
        } else {
          conversation = await AIConversationRepository.create({
            userId,
            tenantId,
            title: 'Outreach Planning'
          });
          isNewConversation = true;
        }
      }
      // Get recent messages for context
      const conversationHistory = await AIMessageRepository.findByConversation(
        conversation.id,
        tenantId,
        { limit: 10 }
      );
      // Load assistant context from conversation metadata
      // Metadata might be stored as JSON string, so parse it
      let metadata = conversation.metadata;
      if (typeof metadata === 'string') {
        try {
          metadata = JSON.parse(metadata);
        } catch (e) {
          metadata = {};
        }
      }
      let assistantContext = metadata?.assistantContext || null;
      // If this is the first message in a new conversation, send initial greeting
      const isFirstMessage = conversationHistory.length === 0;
      if (isFirstMessage || (isNewConversation && (!message || message.trim() === '')) || (message && message.toUpperCase() === 'START')) {
        const greeting = "Would you like Inbound or Outbound lead management?";
        const initialContext = AIAssistantService.initializeContext();
        initialContext.stage = 'outreach_type'; // Move to outreach_type stage
        // Save greeting as assistant message
        await AIMessageRepository.create({
          conversationId: conversation.id,
          tenantId,
          role: 'assistant',
          content: greeting,
          messageData: { isGreeting: true, stage: 'outreach_type' }
        });
        // Save initial context to conversation
        await AIConversationRepository.update(conversation.id, tenantId, { 
          metadata: { assistantContext: initialContext } 
        });
        return res.json({
          success: true,
          conversationId: conversation.id,
          response: greeting,
          text: greeting,
          options: [
            { label: 'Inbound - Leads come to you', value: 'inbound' },
            { label: 'Outbound - You reach out to prospects', value: 'outbound' }
          ],
          assistantContext: initialContext,
          status: 'collecting_info',
          readyForExecution: false
        });
      }
      if (!message || message.trim() === '') {
        return res.status(400).json({
          success: false,
          error: 'Message is required'
        });
      }
      // Process message with AI service
      const result = await AIAssistantService.processChat({
        message,
        conversationId: conversation.id,
        conversationHistory,
        searchResults,
        userId,
        tenantId,
        assistantContext
      });
      // Save user message
      await AIMessageRepository.create({
        conversationId: conversation.id,
        tenantId,
        role: 'user',
        content: message,
        messageData: { searchResultsCount: searchResults?.length || 0 }
      });
      // Save assistant response
      await AIMessageRepository.create({
        conversationId: conversation.id,
        tenantId,
        role: 'assistant',
        content: result.response || result.text,
        messageData: {
          assistantContext: result.assistantContext,
          status: result.status,
          readyForExecution: result.readyForExecution
        },
        tokensUsed: result.tokensUsed,
        model: result.model
      });
      // Update conversation metadata with assistant context
      if (result.assistantContext) {
        const updatedMetadata = metadata || {};
        updatedMetadata.assistantContext = result.assistantContext;
        updatedMetadata.status = result.status;
        updatedMetadata.readyForExecution = result.readyForExecution === true;
        await AIConversationRepository.update(conversation.id, tenantId, { metadata: updatedMetadata });
      }
      res.json({
        success: true,
        conversationId: conversation.id,
        ...result
      });
    } catch (error) {
      logger.error('Chat error', { error, userId: req.user.id, tenantId: req.user.tenantId });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to process chat'
      });
    }
  }
  /**
   * Get conversation history
   * GET /api/ai-icp-assistant/history
   */
  static async getHistory(req, res) {
    try {
      const userId = req.user?.userId;
      const tenantId = req.user?.tenantId;
      const { limit = 20, status = null } = req.query;
      const conversations = await AIConversationRepository.findByUser(
        userId,
        tenantId,
        { status, limit: parseInt(limit) }
      );
      res.json({
        success: true,
        conversations,
        count: conversations.length
      });
    } catch (error) {
      logger.error('Get history error', { error, userId: req.user.userId, tenantId: req.user.tenantId });
      res.status(500).json({
        success: false,
        error: 'Failed to get conversation history'
      });
    }
  }
  /**
   * Get specific conversation with messages
   * GET /api/ai-icp-assistant/conversations/:id
   */
  static async getConversation(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;
      const tenantId = req.user?.tenantId;
      const conversation = await AIConversationRepository.findById(id, tenantId);
      if (!conversation || conversation.user_id !== userId) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found'
        });
      }
      const messages = await AIMessageRepository.findByConversation(id, tenantId);
      const stats = await AIConversationRepository.getStats(id, tenantId);
      res.json({
        success: true,
        conversation,
        messages,
        stats
      });
    } catch (error) {
      logger.error('Get conversation error', { error, userId: req.user.userId, tenantId: req.user.tenantId });
      res.status(500).json({
        success: false,
        error: 'Failed to get conversation'
      });
    }
  }
  /**
   * Reset/archive conversation
   * POST /api/ai-icp-assistant/reset
   */
  static async resetConversation(req, res) {
    try {
      const userId = req.user?.userId;
      const tenantId = req.user?.tenantId;
      const { conversationId = null } = req.body;
      if (conversationId) {
        // Archive specific conversation
        const conversation = await AIConversationRepository.findById(conversationId, tenantId);
        if (!conversation || conversation.user_id !== userId) {
          return res.status(404).json({
            success: false,
            error: 'Conversation not found'
          });
        }
        await AIConversationRepository.archive(conversationId, tenantId);
      } else {
        // Archive active conversation
        const activeConversations = await AIConversationRepository.findByUser(userId, tenantId, {
          status: 'active',
          limit: 1
        });
        if (activeConversations.length > 0) {
          await AIConversationRepository.archive(activeConversations[0].id, tenantId);
        }
      }
      res.json({
        success: true,
        message: 'Conversation reset successfully'
      });
    } catch (error) {
      logger.error('Reset conversation error', { error, userId: req.user.userId, tenantId: req.user.tenantId });
      res.status(500).json({
        success: false,
        error: 'Failed to reset conversation'
      });
    }
  }
  /**
   * Expand keywords using AI
   * POST /api/ai-icp-assistant/expand-keywords
   */
  static async expandKeywords(req, res) {
    try {
      const { topic, context = 'general' } = req.body;
      const tenantId = req.user?.tenantId;
      if (!topic) {
        return res.status(400).json({
          success: false,
          error: 'Topic is required'
        });
      }
      // Check cache first
      const cached = await KeywordExpansionRepository.findByKeyword(topic, context, tenantId);
      if (cached) {
        logger.info('Using cached keyword expansion', { topic, context });
        return res.json({
          success: true,
          original: topic,
          expanded: cached.expanded_keywords,
          keywords: cached.expanded_keywords,
          cached: true
        });
      }
      // Generate new expansion
      const expandedKeywords = await AIAssistantService.expandKeywords(topic, context);
      // Cache the result
      await KeywordExpansionRepository.create({
        originalKeyword: topic,
        expandedKeywords,
        context,
        model: process.env.AI_MODEL || 'gemini-2.0-flash',
        tenantId
      });
      res.json({
        success: true,
        original: topic,
        expanded: expandedKeywords,
        keywords: expandedKeywords,
        cached: false
      });
    } catch (error) {
      logger.error('Expand keywords error', { error, userId: req.user.userId, tenantId: req.user.tenantId });
      res.status(500).json({
        success: false,
        error: 'Failed to expand keywords'
      });
    }
  }
  /**
   * Get ICP profiles for user
   * GET /api/ai-icp-assistant/profiles
   */
  static async getProfiles(req, res) {
    try {
      const userId = req.user?.userId;
      const tenantId = req.user?.tenantId;
      const { limit = 50 } = req.query;
      const profiles = await ICPProfileRepository.findByUser(
        userId,
        tenantId,
        { limit: parseInt(limit) }
      );
      res.json({
        success: true,
        profiles,
        count: profiles.length
      });
    } catch (error) {
      logger.error('Get profiles error', { error, userId: req.user.userId, tenantId: req.user.tenantId });
      res.status(500).json({
        success: false,
        error: 'Failed to get ICP profiles'
      });
    }
  }
  /**
   * Create ICP profile
   * POST /api/ai-icp-assistant/profiles
   */
  static async createProfile(req, res) {
    try {
      const userId = req.user?.userId;
      const tenantId = req.user?.tenantId;
      const { name, description, icpData, searchParams, sourceConversationId } = req.body;
      if (!name || !icpData) {
        return res.status(400).json({
          success: false,
          error: 'Name and ICP data are required'
        });
      }
      const profile = await ICPProfileRepository.create({
        userId,
        tenantId,
        name,
        description,
        icpData,
        searchParams,
        sourceConversationId
      });
      res.status(201).json({
        success: true,
        profile
      });
    } catch (error) {
      logger.error('Create profile error', { error, userId: req.user.userId, tenantId: req.user.tenantId });
      res.status(500).json({
        success: false,
        error: 'Failed to create ICP profile'
      });
    }
  }
  /**
   * Update ICP profile
   * PUT /api/ai-icp-assistant/profiles/:id
   */
  static async updateProfile(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;
      const tenantId = req.user?.tenantId;
      const updates = req.body;
      const profile = await ICPProfileRepository.findById(id, tenantId);
      if (!profile || profile.user_id !== userId) {
        return res.status(404).json({
          success: false,
          error: 'Profile not found'
        });
      }
      const updated = await ICPProfileRepository.update(id, tenantId, updates);
      res.json({
        success: true,
        profile: updated
      });
    } catch (error) {
      logger.error('Update profile error', { error, userId: req.user.userId, tenantId: req.user.tenantId });
      res.status(500).json({
        success: false,
        error: 'Failed to update profile'
      });
    }
  }
  /**
   * Delete ICP profile
   * DELETE /api/ai-icp-assistant/profiles/:id
   */
  static async deleteProfile(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;
      const tenantId = req.user?.tenantId;
      const profile = await ICPProfileRepository.findById(id, tenantId);
      if (!profile || profile.user_id !== userId) {
        return res.status(404).json({
          success: false,
          error: 'Profile not found'
        });
      }
      await ICPProfileRepository.softDelete(id, tenantId);
      res.json({
        success: true,
        message: 'Profile deleted successfully'
      });
    } catch (error) {
      logger.error('Delete profile error', { error, userId: req.user.userId, tenantId: req.user.tenantId });
      res.status(500).json({
        success: false,
        error: 'Failed to delete profile'
      });
    }
  }
  /**
   * Use ICP profile (increment usage)
   * POST /api/ai-icp-assistant/profiles/:id/use
   */
  static async useProfile(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;
      const tenantId = req.user?.tenantId;
      const profile = await ICPProfileRepository.findById(id, tenantId);
      if (!profile || profile.user_id !== userId) {
        return res.status(404).json({
          success: false,
          error: 'Profile not found'
        });
      }
      const updated = await ICPProfileRepository.incrementUsage(id, tenantId);
      res.json({
        success: true,
        profile: updated
      });
    } catch (error) {
      logger.error('Use profile error', { error, userId: req.user.userId, tenantId: req.user.tenantId });
      res.status(500).json({
        success: false,
        error: 'Failed to use profile'
      });
    }
  }
}
module.exports = AIAssistantController;