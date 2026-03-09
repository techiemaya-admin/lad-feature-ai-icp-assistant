/**
 * AI ICP Assistant Routes
 * 
 * Route definitions - delegates to controller for business logic
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const AIAssistantController = require('../controllers/AIAssistantController');
const LeadsUploadController = require('../controllers/LeadsUploadController');
const IndustryClassificationController = require('../controllers/IndustryClassificationController');
const { authenticateToken } = require('../../../core/middleware/auth');
const {
  validateChatRequest,
  validateKeywordRequest,
  validateProfileCreation,
  validateUuidParam,
  validatePagination
} = require('../middleware/validation');
// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});
// ============================================================================
// Conversation Routes
// ============================================================================
/**
 * POST /api/ai-icp-assistant/chat
 * Chat with AI assistant to define ICP and trigger searches
 */
router.post('/chat', authenticateToken, validateChatRequest, AIAssistantController.chat);

/**
 * POST /api/ai-icp-assistant/lead-chat
 * Conversational AI for the Advanced Search AI page.
 * Handles lead refinement (location/title/industry), campaign questions, and general follow-ups.
 * Stateless — conversation context is passed by the client each request, not stored in DB.
 * Self-contained: only imports from within this ai-icp-assistant feature.
 */
router.post('/lead-chat', authenticateToken, async (req, res) => {
  const LeadChatService = require('../services/LeadChatService');
  const logger = require('../utils/logger');
  try {
    const { message, history = [], currentTargeting = null, pendingIntent = null } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }
    const result = await LeadChatService.processMessage({
      message: message.trim(),
      history,
      currentTargeting,
      pendingIntent,
      tenantId: req.user?.tenantId || req.user?.organizationId,
      context: req
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    logger.error('[lead-chat route] Error', { error: error.message });
    return res.status(500).json({
      success: false,
      error: 'Failed to process message',
      response: "I had trouble processing that. Please try again."
    });
  }
});

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

/**
 * POST /api/ai-icp-assistant/messages/batch-save
 * Batch save buffered campaign chat messages from localStorage
 */
router.post('/messages/batch-save', authenticateToken, AIAssistantController.saveCampaignChatMessages);
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
// Leads Upload Routes
// ============================================================================
/**
 * GET /api/ai-icp-assistant/leads/template
 * Download CSV template for leads upload
 */
router.get('/leads/template', authenticateToken, LeadsUploadController.downloadTemplate);
/**
 * GET /api/ai-icp-assistant/leads/template/columns
 * Get template column definitions
 */
router.get('/leads/template/columns', authenticateToken, LeadsUploadController.getTemplateColumns);
/**
 * POST /api/ai-icp-assistant/leads/upload
 * Upload and parse CSV file
 */
router.post('/leads/upload', authenticateToken, upload.single('file'), LeadsUploadController.uploadLeads);
/**
 * POST /api/ai-icp-assistant/leads/analyze
 * Deep AI analysis of uploaded leads
 */
router.post('/leads/analyze', authenticateToken, LeadsUploadController.analyzeLeads);
/**
 * POST /api/ai-icp-assistant/leads/platform-questions
 * Get platform-specific questions based on lead data
 */
router.post('/leads/platform-questions', authenticateToken, LeadsUploadController.getPlatformQuestions);
/**
 * POST /api/ai-icp-assistant/leads/validate
 * Validate leads for campaign execution
 */
router.post('/leads/validate', authenticateToken, LeadsUploadController.validateLeads);
// ============================================================================
// Industry Classification Routes (Gemini AI)
// ============================================================================
/**
 * POST /api/ai-icp-assistant/classify-industry
 * Classify user's industry input to Apollo taxonomy
 */
router.post('/classify-industry', authenticateToken, IndustryClassificationController.classifyIndustry);
/**
 * GET /api/ai-icp-assistant/industry-suggestions
 * Get industry suggestions for autocomplete
 */
router.get('/industry-suggestions', authenticateToken, IndustryClassificationController.getIndustrySuggestions);
// ============================================================================
// ICP Onboarding Routes
// ============================================================================
// Use the new feature-based routes which include proper middleware and validation
const aiICPAssistantRoutes = require('./ai-icp-assistant.routes');
router.use('/', aiICPAssistantRoutes);
// ============================================================================
// Inbound Data Routes
// ============================================================================
// Inbound lead data analysis and dynamic question generation
const inboundRoutes = require('./inbound.routes');
router.use('/inbound', inboundRoutes);
module.exports = router;
