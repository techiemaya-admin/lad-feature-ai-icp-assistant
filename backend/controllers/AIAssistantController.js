/**
 * AI ICP Assistant Controller
 * 
 * Handles business logic for AI conversations, ICP profiles, and keyword expansion
 */

const { AIConversation, AIMessage, ICPProfile, KeywordExpansion } = require('../models');
const AIAssistantService = require('../services/AIAssistantService');

class AIAssistantController {
  /**
   * Chat with AI Assistant - Phase 1: Intent Understanding
   * POST /api/ai-icp-assistant/chat
   */
  static async chat(req, res) {
    try {
      const { message, conversationId = null, searchResults = [] } = req.body;
      const userId = req.user?.userId;
      const organizationId = req.user?.organizationId;

      // Get or create conversation
      let conversation;
      let isNewConversation = false;
      
      if (conversationId) {
        conversation = await AIConversation.findById(conversationId);
        if (!conversation || conversation.user_id !== userId) {
          return res.status(404).json({
            success: false,
            error: 'Conversation not found'
          });
        }
      } else {
        // Get active conversation or create new one
        conversation = await AIConversation.getActiveForUser(userId, organizationId);
        if (!conversation) {
          conversation = await AIConversation.create({
            userId,
            organizationId,
            title: 'Outreach Planning'
          });
          isNewConversation = true;
        }
      }

      // Get recent messages for context
      const conversationHistory = await AIMessage.findByConversation(
        conversation.id,
        { limit: 10, order: 'ASC' }
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

      // If new conversation and no message, send initial greeting
      if (isNewConversation && (!message || message.trim() === '')) {
        const greeting = "👉 What type of outreach are you setting up?\n\n1) Inbound (leads come to you)\n2) Outbound (you reach out to prospects)";
        const initialContext = AIAssistantService.initializeContext();
        initialContext.stage = 'outreach_type'; // Move to outreach_type stage
        
        // Save greeting as assistant message
        await AIMessage.create({
          conversationId: conversation.id,
          role: 'assistant',
          content: greeting,
          messageData: { isGreeting: true, stage: 'outreach_type' }
        });

        // Save initial context to conversation
        await AIConversation.update(conversation.id, { 
          metadata: { assistantContext: initialContext } 
        });

        return res.json({
          success: true,
          conversationId: conversation.id,
          response: greeting,
          text: greeting,
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
        organizationId,
        assistantContext
      });

      // Save user message
      await AIMessage.create({
        conversationId: conversation.id,
        role: 'user',
        content: message,
        messageData: { searchResultsCount: searchResults?.length || 0 }
      });

      // Save assistant response
      await AIMessage.create({
        conversationId: conversation.id,
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
        
        await AIConversation.update(conversation.id, { metadata: updatedMetadata });
      }

      res.json({
        success: true,
        conversationId: conversation.id,
        ...result
      });

    } catch (error) {
      console.error('Chat error:', error);
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
      const organizationId = req.user?.organizationId;
      const { limit = 20, offset = 0, status = null } = req.query;

      const conversations = await AIConversation.findByUser(
        userId,
        organizationId,
        { status, limit: parseInt(limit), offset: parseInt(offset) }
      );

      res.json({
        success: true,
        conversations,
        count: conversations.length
      });

    } catch (error) {
      console.error('Get history error:', error);
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

      const conversation = await AIConversation.findById(id);
      if (!conversation || conversation.user_id !== userId) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found'
        });
      }

      const messages = await AIMessage.findByConversation(id);
      const stats = await AIConversation.getWithStats(id);

      res.json({
        success: true,
        conversation,
        messages,
        stats
      });

    } catch (error) {
      console.error('Get conversation error:', error);
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
      const organizationId = req.user?.organizationId;
      const { conversationId = null } = req.body;

      if (conversationId) {
        // Archive specific conversation
        const conversation = await AIConversation.findById(conversationId);
        if (!conversation || conversation.user_id !== userId) {
          return res.status(404).json({
            success: false,
            error: 'Conversation not found'
          });
        }
        await AIConversation.archive(conversationId);
      } else {
        // Archive active conversation
        const activeConversation = await AIConversation.getActiveForUser(userId, organizationId);
        if (activeConversation) {
          await AIConversation.archive(activeConversation.id);
        }
      }

      res.json({
        success: true,
        message: 'Conversation reset successfully'
      });

    } catch (error) {
      console.error('Reset conversation error:', error);
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
      const organizationId = req.user?.organizationId;

      if (!topic) {
        return res.status(400).json({
          success: false,
          error: 'Topic is required'
        });
      }

      // Check cache first
      const cached = await KeywordExpansion.findCached(topic, context, organizationId);
      if (cached) {
        console.log('✅ Using cached keyword expansion');
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
      await KeywordExpansion.upsert({
        originalKeyword: topic,
        expandedKeywords,
        context,
        model: process.env.AI_MODEL || 'gemini-2.0-flash',
        organizationId
      });

      res.json({
        success: true,
        original: topic,
        expanded: expandedKeywords,
        keywords: expandedKeywords,
        cached: false
      });

    } catch (error) {
      console.error('Expand keywords error:', error);
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
      const organizationId = req.user?.organizationId;
      const { limit = 50, offset = 0 } = req.query;

      const profiles = await ICPProfile.findByUser(
        userId,
        organizationId,
        { limit: parseInt(limit), offset: parseInt(offset) }
      );

      res.json({
        success: true,
        profiles,
        count: profiles.length
      });

    } catch (error) {
      console.error('Get profiles error:', error);
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
      const organizationId = req.user?.organizationId;
      const { name, description, icpData, searchParams, sourceConversationId } = req.body;

      if (!name || !icpData) {
        return res.status(400).json({
          success: false,
          error: 'Name and ICP data are required'
        });
      }

      const profile = await ICPProfile.create({
        userId,
        organizationId,
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
      console.error('Create profile error:', error);
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
      const updates = req.body;

      const profile = await ICPProfile.findById(id);
      if (!profile || profile.user_id !== userId) {
        return res.status(404).json({
          success: false,
          error: 'Profile not found'
        });
      }

      const updated = await ICPProfile.update(id, updates);

      res.json({
        success: true,
        profile: updated
      });

    } catch (error) {
      console.error('Update profile error:', error);
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

      const profile = await ICPProfile.findById(id);
      if (!profile || profile.user_id !== userId) {
        return res.status(404).json({
          success: false,
          error: 'Profile not found'
        });
      }

      await ICPProfile.deactivate(id);

      res.json({
        success: true,
        message: 'Profile deleted successfully'
      });

    } catch (error) {
      console.error('Delete profile error:', error);
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

      const profile = await ICPProfile.findById(id);
      if (!profile || profile.user_id !== userId) {
        return res.status(404).json({
          success: false,
          error: 'Profile not found'
        });
      }

      const updated = await ICPProfile.incrementUsage(id);

      res.json({
        success: true,
        profile: updated
      });

    } catch (error) {
      console.error('Use profile error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to use profile'
      });
    }
  }
}

module.exports = AIAssistantController;
