/**
 * AI ICP Assistant Routes
 * 
 * Route definitions - delegates to controller for business logic
 */

const express = require('express');
const router = express.Router();
const AIAssistantController = require('../controllers/AIAssistantController');
const { authenticateToken } = require('../../../core/middleware/auth');
const {
  validateChatRequest,
  validateKeywordRequest,
  validateProfileCreation,
  validateUuidParam,
  validatePagination
} = require('../middleware/validation');

// ============================================================================
// Conversation Routes
// ============================================================================

/**
 * POST /api/ai-icp-assistant/chat
 * Chat with AI assistant to define ICP and trigger searches
 */
router.post('/chat', authenticateToken, validateChatRequest, AIAssistantController.chat);

/**
 * GET /api/ai-icp-assistant/history
 * Get conversation history for user
 */
router.get('/history', authenticateToken, validatePagination, AIAssistantController.getHistory);

/**
 * GET /api/ai-icp-assistant/conversations/:id
 * Get specific conversation with all messages
 */
router.get('/conversations/:id', authenticateToken, validateUuidParam('id'), AIAssistantController.getConversation);

/**
 * POST /api/ai-icp-assistant/reset
 * Reset/archive active conversation
 */
router.post('/reset', authenticateToken, AIAssistantController.resetConversation);

// ============================================================================
// Keyword Expansion Routes
// ============================================================================

/**
 * POST /api/ai-icp-assistant/expand-keywords
 * Expand keywords/topic into comprehensive search terms
 */
router.post('/expand-keywords', authenticateToken, validateKeywordRequest, AIAssistantController.expandKeywords);

// ============================================================================
// ICP Profile Routes
// ============================================================================

/**
 * GET /api/ai-icp-assistant/profiles
 * Get all ICP profiles for user
 */
router.get('/profiles', authenticateToken, validatePagination, AIAssistantController.getProfiles);

/**
 * POST /api/ai-icp-assistant/profiles
 * Create new ICP profile
 */
router.post('/profiles', authenticateToken, validateProfileCreation, AIAssistantController.createProfile);

/**
 * PUT /api/ai-icp-assistant/profiles/:id
 * Update existing ICP profile
 */
router.put('/profiles/:id', authenticateToken, validateUuidParam('id'), AIAssistantController.updateProfile);

/**
 * DELETE /api/ai-icp-assistant/profiles/:id
 * Delete (deactivate) ICP profile
 */
router.delete('/profiles/:id', authenticateToken, validateUuidParam('id'), AIAssistantController.deleteProfile);

/**
 * POST /api/ai-icp-assistant/profiles/:id/use
 * Increment profile usage counter
 */
router.post('/profiles/:id/use', authenticateToken, validateUuidParam('id'), AIAssistantController.useProfile);

// ============================================================================
// ICP Onboarding Routes (Using new AI-ICP-Assistant feature)
// ============================================================================

// Use the new feature-based routes which include proper middleware and validation
// The routes file already includes '/onboarding' prefix, so mount at root
const aiICPAssistantRoutes = require('./ai-icp-assistant.routes');
router.use('/', aiICPAssistantRoutes);

module.exports = router;
