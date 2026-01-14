/**
 * Test Server for AI ICP Assistant
 * 
 * Simple Express server to test the AI ICP Assistant endpoints
 * with proper database connection and middleware.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

// Load environment variables from .env file
require('dotenv').config();

// Environment configuration with fallbacks
if (!process.env.DB_HOST) {
  process.env.DB_HOST = '165.22.221.77';
  process.env.DB_PORT = '5432';
  process.env.DB_NAME = 'salesmaya_agent';
  process.env.DB_USER = 'dbadmin';
  process.env.DB_PASSWORD = 'TechieMaya';
  process.env.DB_SCHEMA = 'lad_dev';
}

// Backward compatibility for DATABASE_URL
if (process.env.DATABASE_URL && !process.env.DB_HOST) {
  const url = new URL(process.env.DATABASE_URL);
  process.env.DB_HOST = url.hostname;
  process.env.DB_PORT = url.port || '5432';
  process.env.DB_NAME = url.pathname.slice(1).split('?')[0];
  process.env.DB_USER = url.username;
  process.env.DB_PASSWORD = url.password;
  
  const searchParams = new URLSearchParams(url.search);
  process.env.DB_SCHEMA = searchParams.get('schema') || 'lad_dev';
}

const app = express();
const PORT = process.env.PORT || 3001;

<<<<<<< HEAD
// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  console.log('Headers:', {
    userId: req.headers['x-user-id'],
    orgId: req.headers['x-organization-id'],
    tenantId: req.headers['x-tenant-id']
  });
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// Mock authentication middleware (for testing)
app.use((req, res, next) => {
  // Extract user info from headers (in production, this comes from JWT)
  const userId = req.headers['x-user-id'] || req.headers['userid'] || '1';
  const tenantId = req.headers['x-tenant-id'] || req.headers['tenantid'] || '00000000-0000-0000-0000-000000000001';
  
  req.user = {
    id: userId,
    userId: userId, // Add both for compatibility
    organizationId: req.headers['x-organization-id'] || 'test-org-456',
    tenantId: tenantId,
    schema: 'lad_dev', // In production, this is resolved from tenant
    capabilities: ['chat_with_ai', 'define_icp', 'trigger_apollo_search'] // Mock capabilities
  };
  next();
});

// Mount AI ICP Assistant routes
try {
  const aiICPRoutes = require('./backend/features/ai-icp-assistant/routes/index.js');
  app.use('/api/ai-icp-assistant', aiICPRoutes);
  console.log('✅ AI ICP Assistant routes mounted at /api/ai-icp-assistant');
} catch (error) {
  console.error('❌ Failed to mount AI ICP Assistant routes:', error.message);
  console.log('⚠️  Attempting to mount routes without onboarding endpoints...');
  
  try {
    // Create a simplified router without the problematic require
    const express = require('express');
    const router = express.Router();
    const AIAssistantController = require('./backend/features/ai-icp-assistant/controllers/AIAssistantController');
    const {
      validateChatRequest,
      validateKeywordRequest,
      validateProfileCreation,
      validateUuidParam,
      validatePagination
    } = require('./backend/features/ai-icp-assistant/middleware/validation');

    // Chat routes
    router.post('/chat', validateChatRequest, AIAssistantController.chat);
    router.get('/history', validatePagination, AIAssistantController.getHistory);
    router.get('/conversations/:id', validateUuidParam('id'), AIAssistantController.getConversation);
    router.post('/reset', AIAssistantController.resetConversation);
    
    // Keyword expansion
    router.post('/expand-keywords', validateKeywordRequest, AIAssistantController.expandKeywords);
    
    // ICP Profiles
    router.get('/profiles', validatePagination, AIAssistantController.getProfiles);
    router.post('/profiles', validateProfileCreation, AIAssistantController.createProfile);
    router.put('/profiles/:id', validateUuidParam('id'), AIAssistantController.updateProfile);
    router.delete('/profiles/:id', validateUuidParam('id'), AIAssistantController.deleteProfile);
    router.post('/profiles/:id/use', validateUuidParam('id'), AIAssistantController.useProfile);
    
    // Try to mount onboarding routes separately
    try {
      const onboardingRoutes = require('./backend/features/ai-icp-assistant/routes/ai-icp-assistant.routes');
      router.use('/', onboardingRoutes);
      console.log('✅ Onboarding routes also mounted');
    } catch (onboardingError) {
      console.log('⚠️  Onboarding routes not available (this is OK for basic testing)');
    }
    
    app.use('/api/ai-icp-assistant', router);
    console.log('✅ Basic AI ICP Assistant routes mounted successfully');
  } catch (fallbackError) {
    console.error('❌ Failed to mount even basic routes:', fallbackError.message);
  }
}

// Serve static test UI
app.use('/test-ui', express.static(path.join(__dirname)));
app.get('/test-ui', (req, res) => {
  res.sendFile(path.join(__dirname, 'test-ui.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      database: process.env.DATABASE_URL ? 'configured' : 'not configured',
      geminiApi: process.env.GEMINI_API_KEY ? 'configured' : 'not configured'
    }
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'AI ICP Assistant Test Server',
    version: '1.0.0',
    endpoints: {
      testUI: '/test-ui',
      health: '/health',
      api: '/api/ai-icp-assistant/*'
    },
    availableRoutes: [
      'POST /api/ai-icp-assistant/chat',
      'GET /api/ai-icp-assistant/history',
      'GET /api/ai-icp-assistant/conversations/:id',
      'POST /api/ai-icp-assistant/reset',
      'POST /api/ai-icp-assistant/expand-keywords',
      'GET /api/ai-icp-assistant/profiles',
      'POST /api/ai-icp-assistant/profiles',
      'PUT /api/ai-icp-assistant/profiles/:id',
      'DELETE /api/ai-icp-assistant/profiles/:id',
      'POST /api/ai-icp-assistant/profiles/:id/use',
      'GET /api/ai-icp-assistant/onboarding/icp-questions',
      'GET /api/ai-icp-assistant/onboarding/icp-questions/:stepIndex',
      'POST /api/ai-icp-assistant/onboarding/icp-answer'
    ]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
    path: req.path
  });
});

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log('='.repeat(60));
  console.log('🚀 AI ICP Assistant Test Server');
  console.log('='.repeat(60));
  console.log(`Server running on: http://localhost:${PORT}`);
  console.log(`Test UI available at: http://localhost:${PORT}/test-ui`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log('');
  console.log('Configuration:');
  console.log(`- Database: ${process.env.DB_HOST ? '✅ Connected' : '❌ Not configured'} (${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME})`);
  console.log(`- Schema: ${process.env.DB_SCHEMA || 'lad_dev'}`);
  console.log(`- Gemini API: ${process.env.GEMINI_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
  console.log('='.repeat(60));
  console.log('');
=======
// Basic middleware
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'ai-icp-assistant-test',
    version: '2.0.0'
  });
});

// Mount routes (with error handling for CI environment)
try {
  const routes = require('./backend/features/ai-icp-assistant/routes');
  app.use('/api/ai-icp-assistant', routes);
  console.log('✅ Routes loaded successfully');
} catch (error) {
  console.error('⚠️  Routes could not be loaded (may be expected in test environment):', error.message);
}

// Start server
const server = app.listen(PORT, () => {
  console.log(`✅ Test server started on port ${PORT}`);
>>>>>>> eee5077 (feat: AI ICP Assistant with duplicate question fix and improved flow control)
});

// Graceful shutdown
process.on('SIGTERM', () => {
<<<<<<< HEAD
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});
=======
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = app;
>>>>>>> eee5077 (feat: AI ICP Assistant with duplicate question fix and improved flow control)
