/**
 * Leads Analyzer Service
 * Uses AI to analyze uploaded leads and generate insights
 */
const GeminiResponseGenerator = require('./GeminiResponseGenerator');
const LeadsTemplateService = require('./LeadsTemplateService');
const logger = require('../utils/logger');
class LeadsAnalyzerService {
  /**
   * Analyze leads data and generate AI insights
   * @param {Array} leads - Parsed leads array
   * @returns {Object} AI analysis results
   */
  static async analyzeWithAI(leads) {
    try {
      const basicAnalysis = LeadsTemplateService.analyzeLeadsData(leads);
      const platforms = LeadsTemplateService.detectPlatforms(leads);
      if (!basicAnalysis.success) {
        return basicAnalysis;
      }
      // Build context for AI analysis
      const analysisContext = this.buildAnalysisContext(leads, basicAnalysis, platforms);
      // Generate AI summary using Gemini
      const aiSummary = await this.generateAISummary(analysisContext);
      return {
        success: true,
        basicAnalysis,
        platforms,
        aiSummary,
        recommendedActions: this.getRecommendedActions(platforms, basicAnalysis),
        suggestedPlatforms: platforms.available,
        excludedPlatforms: platforms.unavailable
      };
    } catch (error) {
      logger.error('[LeadsAnalyzerService] Analysis error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  /**
   * Build context for AI analysis
   */
  static buildAnalysisContext(leads, analysis, platforms) {
    // Sample 10 leads for context (to avoid token limits)
    const sampleLeads = leads.slice(0, 10).map(lead => ({
      name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
      company: lead.company || 'N/A',
      title: lead.job_title || 'N/A',
      industry: lead.industry || 'N/A',
      hasLinkedIn: !!lead.linkedin_url,
      hasEmail: !!lead.email,
      hasPhone: !!lead.phone
    }));
    return {
      totalLeads: analysis.totalLeads,
      industries: analysis.industries,
      jobTitles: analysis.jobTitles,
      locations: analysis.locations,
      companySizes: analysis.companySizes,
      uniqueCompanies: analysis.uniqueCompanies,
      platformCoverage: platforms.coverage,
      sampleLeads
    };
  }
  /**
   * Generate AI summary of the leads data
   */
  static async generateAISummary(context) {
    try {
      const prompt = `Analyze this B2B leads data and provide a concise 2-3 sentence summary:
Total Leads: ${context.totalLeads}
Top Industries: ${context.industries.map(i => `${i.name} (${i.percentage}%)`).join(', ') || 'Not specified'}
Top Job Titles: ${context.jobTitles.slice(0, 5).map(j => j.name).join(', ') || 'Not specified'}
Top Locations: ${context.locations.map(l => l.name).join(', ') || 'Not specified'}
Unique Companies: ${context.uniqueCompanies}
Platform Data Coverage:
- LinkedIn URLs: ${context.platformCoverage.linkedin?.percentage || 0}%
- Email Addresses: ${context.platformCoverage.email?.percentage || 0}%
- Phone Numbers: ${context.platformCoverage.voice?.percentage || 0}%
- WhatsApp: ${context.platformCoverage.whatsapp?.percentage || 0}%
Sample Leads:
${context.sampleLeads.map(l => `- ${l.name} | ${l.title} @ ${l.company} | ${l.industry}`).join('\n')}
Provide a brief, actionable summary focusing on:
1. The target audience profile
2. Best outreach channels based on available data
3. One key insight or recommendation`;
      const response = await GeminiResponseGenerator.generateDirectResponse(prompt);
      return response || this.getFallbackSummary(context);
    } catch (error) {
      logger.error('[LeadsAnalyzerService] AI summary error:', error);
      return this.getFallbackSummary(context);
    }
  }
  /**
   * Fallback summary if AI fails
   */
  static getFallbackSummary(context) {
    const topIndustry = context.industries[0]?.name || 'various industries';
    const topRole = context.jobTitles[0]?.name || 'professionals';
    const bestChannel = this.getBestChannel(context.platformCoverage);
    return `Your ${context.totalLeads} leads primarily target ${topRole} in ${topIndustry}. ` +
      `${bestChannel.text} Based on your data, we recommend focusing on ${bestChannel.platform} outreach for best results.`;
  }
  /**
   * Get best channel recommendation
   */
  static getBestChannel(coverage) {
    const channels = [
      { platform: 'email', percentage: coverage.email?.percentage || 0, text: 'Email coverage is strong.' },
      { platform: 'LinkedIn', percentage: coverage.linkedin?.percentage || 0, text: 'LinkedIn profile data is available.' },
      { platform: 'phone', percentage: coverage.voice?.percentage || 0, text: 'Phone numbers are available for calls.' }
    ];
    const best = channels.sort((a, b) => b.percentage - a.percentage)[0];
    return best.percentage > 0 ? best : { platform: 'multi-channel', text: 'Consider enriching your data.' };
  }
  /**
   * Get recommended actions based on analysis
   */
  static getRecommendedActions(platforms, analysis) {
    const actions = [];
    // Platform-specific recommendations
    if (platforms.available.includes('linkedin') && platforms.coverage.linkedin.percentage >= 50) {
      actions.push({
        platform: 'linkedin',
        action: 'connection_request',
        priority: 'high',
        reason: `${platforms.coverage.linkedin.percentage}% of leads have LinkedIn profiles`
      });
    }
    if (platforms.available.includes('email') && platforms.coverage.email.percentage >= 50) {
      actions.push({
        platform: 'email',
        action: 'email_sequence',
        priority: 'high',
        reason: `${platforms.coverage.email.percentage}% of leads have email addresses`
      });
    }
    if (platforms.available.includes('voice') && platforms.coverage.voice.percentage >= 30) {
      actions.push({
        platform: 'voice',
        action: 'cold_call',
        priority: 'medium',
        reason: `${platforms.coverage.voice.percentage}% of leads have phone numbers`
      });
    }
    // Enrichment recommendations
    if (platforms.unavailable.includes('linkedin') && platforms.available.includes('email')) {
      actions.push({
        platform: 'enrichment',
        action: 'enrich_linkedin',
        priority: 'medium',
        reason: 'Missing LinkedIn data - consider enrichment to add connection requests'
      });
    }
    if (platforms.unavailable.includes('email') && platforms.available.includes('linkedin')) {
      actions.push({
        platform: 'enrichment',
        action: 'enrich_email',
        priority: 'medium',
        reason: 'Missing email data - consider enrichment for email outreach'
      });
    }
    return actions;
  }
  /**
   * Generate platform-specific questions based on available data
   * @param {Object} platforms - Platform detection results
   * @returns {Array} Questions to ask user
   */
  static generatePlatformQuestions(platforms) {
    const questions = [];
    // Only ask about available platforms
    if (platforms.available.includes('linkedin')) {
      questions.push({
        id: 'linkedin_action',
        platform: 'linkedin',
        question: 'What LinkedIn actions would you like to take?',
        options: [
          { value: 'connection_request', label: 'Send connection requests' },
          { value: 'inmail', label: 'Send InMail messages' },
          { value: 'profile_view', label: 'View profiles first' },
          { value: 'follow', label: 'Follow profiles' }
        ],
        coverage: platforms.coverage.linkedin.percentage
      });
      questions.push({
        id: 'linkedin_message',
        platform: 'linkedin',
        question: 'Would you like to include a personalized connection message?',
        type: 'boolean'
      });
    }
    if (platforms.available.includes('email')) {
      questions.push({
        id: 'email_action',
        platform: 'email',
        question: 'What email approach would you prefer?',
        options: [
          { value: 'cold_email', label: 'Cold email outreach' },
          { value: 'nurture_sequence', label: 'Nurture sequence (multiple emails)' },
          { value: 'single_email', label: 'Single personalized email' }
        ],
        coverage: platforms.coverage.email.percentage
      });
      questions.push({
        id: 'email_followups',
        platform: 'email',
        question: 'How many follow-up emails?',
        type: 'number',
        min: 0,
        max: 5,
        default: 2
      });
    }
    if (platforms.available.includes('voice')) {
      questions.push({
        id: 'voice_action',
        platform: 'voice',
        question: 'Would you like to include phone calls?',
        options: [
          { value: 'cold_call', label: 'Cold calls' },
          { value: 'follow_up_call', label: 'Follow-up calls after email/LinkedIn' },
          { value: 'voicemail', label: 'Leave voicemails only' },
          { value: 'no_calls', label: 'No phone calls' }
        ],
        coverage: platforms.coverage.voice.percentage
      });
    }
    if (platforms.available.includes('whatsapp')) {
      questions.push({
        id: 'whatsapp_action',
        platform: 'whatsapp',
        question: 'Would you like to use WhatsApp messaging?',
        options: [
          { value: 'whatsapp_message', label: 'Send WhatsApp messages' },
          { value: 'whatsapp_followup', label: 'WhatsApp as follow-up only' },
          { value: 'no_whatsapp', label: 'Skip WhatsApp' }
        ],
        coverage: platforms.coverage.whatsapp.percentage
      });
    }
    // Add sequencing question if multiple platforms available
    if (platforms.available.length > 1) {
      questions.push({
        id: 'sequence_order',
        platform: 'multi',
        question: 'In what order would you like to reach out?',
        type: 'sequence',
        availablePlatforms: platforms.available.map(p => ({
          value: p,
          label: LeadsTemplateService.getPlatformEmoji(p) + ' ' + p.charAt(0).toUpperCase() + p.slice(1)
        }))
      });
      questions.push({
        id: 'delay_between',
        platform: 'multi',
        question: 'How many days between each touchpoint?',
        type: 'number',
        min: 1,
        max: 14,
        default: 2
      });
    }
    return questions;
  }
  /**
   * Validate leads for campaign execution
   */
  static validateForExecution(leads, selectedPlatforms) {
    const issues = [];
    const valid = [];
    const invalid = [];
    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      const leadIssues = [];
      // Check required data for each selected platform
      for (const platform of selectedPlatforms) {
        switch (platform) {
          case 'linkedin':
            if (!lead.linkedin_url) {
              leadIssues.push('Missing LinkedIn URL');
            }
            break;
          case 'email':
            if (!lead.email || !this.isValidEmail(lead.email)) {
              leadIssues.push('Invalid or missing email');
            }
            break;
          case 'voice':
            if (!lead.phone) {
              leadIssues.push('Missing phone number');
            }
            break;
          case 'whatsapp':
            if (!lead.whatsapp && !lead.phone) {
              leadIssues.push('Missing WhatsApp/phone number');
            }
            break;
        }
      }
      if (leadIssues.length > 0) {
        invalid.push({ index: i, lead, issues: leadIssues });
      } else {
        valid.push(lead);
      }
    }
    return {
      valid,
      invalid,
      totalLeads: leads.length,
      validCount: valid.length,
      invalidCount: invalid.length,
      canExecute: valid.length > 0
    };
  }
  /**
   * Simple email validation
   */
  static isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}
module.exports = LeadsAnalyzerService;