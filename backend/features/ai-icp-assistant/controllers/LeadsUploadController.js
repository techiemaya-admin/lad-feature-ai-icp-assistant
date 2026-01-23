/**
 * Leads Upload Controller
 * Handles CSV template download and leads file upload
 */
const LeadsTemplateService = require('../services/LeadsTemplateService');
const LeadsAnalyzerService = require('../services/LeadsAnalyzerService');
const logger = require('../utils/logger');
class LeadsUploadController {
  /**
   * GET /api/ai-icp-assistant/leads/template
   * Download CSV template for leads upload
   */
  static async downloadTemplate(req, res) {
    try {
      const template = LeadsTemplateService.generateTemplate();
      res.setHeader('Content-Type', template.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${template.filename}"`);
      res.send(template.content);
    } catch (error) {
      logger.error('[LeadsUploadController] Template download error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate template'
      });
    }
  }
  /**
   * GET /api/ai-icp-assistant/leads/template/columns
   * Get template column definitions (for UI)
   */
  static async getTemplateColumns(req, res) {
    try {
      const template = LeadsTemplateService.generateTemplate();
      res.json({
        success: true,
        columns: template.columns,
        platformFields: LeadsTemplateService.PLATFORM_FIELDS
      });
    } catch (error) {
      logger.error('[LeadsUploadController] Get columns error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get template columns'
      });
    }
  }
  /**
   * POST /api/ai-icp-assistant/leads/upload
   * Upload and parse CSV file
   * Accepts: multipart/form-data with 'file' field OR JSON with 'csvContent'
   */
  static async uploadLeads(req, res) {
    try {
      let csvContent;
      // Handle multipart file upload
      if (req.file) {
        csvContent = req.file.buffer.toString('utf-8');
      } else if (req.body.csvContent) {
        // Handle JSON with CSV content
        csvContent = req.body.csvContent;
      } else {
        return res.status(400).json({
          success: false,
          error: 'No file or CSV content provided'
        });
      }
      // Parse CSV
      const parseResult = LeadsTemplateService.parseCSV(csvContent);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          error: parseResult.error
        });
      }
      if (parseResult.validLeads === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid leads found in the uploaded file',
          details: parseResult.errors
        });
      }
      // Detect platforms
      const platforms = LeadsTemplateService.detectPlatforms(parseResult.leads);
      // Basic analysis
      const analysis = LeadsTemplateService.analyzeLeadsData(parseResult.leads);
      // Generate summary
      const summary = LeadsTemplateService.generateLeadsSummary(analysis, platforms);
      res.json({
        success: true,
        message: `Successfully parsed ${parseResult.validLeads} leads`,
        data: {
          leads: parseResult.leads,
          totalRows: parseResult.totalRows,
          validLeads: parseResult.validLeads,
          errors: parseResult.errors,
          headers: parseResult.headers,
          platforms,
          analysis,
          summary
        }
      });
    } catch (error) {
      logger.error('[LeadsUploadController] Upload error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process uploaded file'
      });
    }
  }
  /**
   * POST /api/ai-icp-assistant/leads/analyze
   * Deep AI analysis of uploaded leads
   */
  static async analyzeLeads(req, res) {
    try {
      const { leads } = req.body;
      if (!leads || !Array.isArray(leads) || leads.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No leads provided for analysis'
        });
      }
      const analysis = await LeadsAnalyzerService.analyzeWithAI(leads);
      if (!analysis.success) {
        return res.status(400).json({
          success: false,
          error: analysis.error
        });
      }
      res.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      logger.error('[LeadsUploadController] Analysis error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to analyze leads'
      });
    }
  }
  /**
   * POST /api/ai-icp-assistant/leads/platform-questions
   * Get platform-specific questions based on available lead data
   */
  static async getPlatformQuestions(req, res) {
    try {
      const { leads, platforms: providedPlatforms } = req.body;
      let platforms;
      if (providedPlatforms) {
        platforms = providedPlatforms;
      } else if (leads && Array.isArray(leads)) {
        platforms = LeadsTemplateService.detectPlatforms(leads);
      } else {
        return res.status(400).json({
          success: false,
          error: 'Provide either leads array or platforms object'
        });
      }
      const questions = LeadsAnalyzerService.generatePlatformQuestions(platforms);
      res.json({
        success: true,
        data: {
          questions,
          availablePlatforms: platforms.available,
          unavailablePlatforms: platforms.unavailable,
          coverage: platforms.coverage
        }
      });
    } catch (error) {
      logger.error('[LeadsUploadController] Platform questions error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate platform questions'
      });
    }
  }
  /**
   * POST /api/ai-icp-assistant/leads/validate
   * Validate leads for campaign execution
   */
  static async validateLeads(req, res) {
    try {
      const { leads, selectedPlatforms } = req.body;
      if (!leads || !Array.isArray(leads)) {
        return res.status(400).json({
          success: false,
          error: 'No leads provided'
        });
      }
      if (!selectedPlatforms || !Array.isArray(selectedPlatforms)) {
        return res.status(400).json({
          success: false,
          error: 'No platforms selected'
        });
      }
      const validation = LeadsAnalyzerService.validateForExecution(leads, selectedPlatforms);
      res.json({
        success: true,
        data: validation
      });
    } catch (error) {
      logger.error('[LeadsUploadController] Validation error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to validate leads'
      });
    }
  }
}
module.exports = LeadsUploadController;