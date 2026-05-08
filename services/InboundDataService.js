/**
 * Inbound Data Service
 * 
 * Handles inbound lead data analysis and dynamic question generation using Gemini AI
 */
const GeminiClient = require('./gemini-client.service');
const logger = require('../utils/logger');
class InboundDataService {
  /**
   * Platform-specific question templates
   */
  static PLATFORM_QUESTIONS = {
    linkedin: [
      {
        intentKey: 'linkedin_actions',
        questionText: 'What actions would you like to perform on LinkedIn?',
        questionType: 'multi-select',
        options: [
          { label: 'Send connection request', value: 'connect' },
          { label: 'View profile', value: 'view' },
          { label: 'Send message after connection', value: 'message' },
          { label: 'Like/Comment on posts', value: 'engage' },
        ],
        helperText: 'Select all LinkedIn actions you want to include',
      },
      {
        intentKey: 'linkedin_message_template',
        questionText: 'Please provide your LinkedIn message template (use {name}, {company} for personalization):',
        questionType: 'text',
        dependsOn: { key: 'linkedin_actions', contains: 'message' },
        helperText: 'This message will be sent after connection is accepted',
      },
    ],
    email: [
      {
        intentKey: 'email_type',
        questionText: 'What type of email would you like to send?',
        questionType: 'select',
        options: [
          { label: 'Introduction email', value: 'intro' },
          { label: 'Follow-up email', value: 'followup' },
          { label: 'Promotional email', value: 'promo' },
          { label: 'Custom email', value: 'custom' },
        ],
        helperText: 'Choose the type of email',
      },
      {
        intentKey: 'email_subject',
        questionText: 'What should be the email subject line?',
        questionType: 'text',
        helperText: 'Use {name}, {company} for personalization',
      },
      {
        intentKey: 'email_template',
        questionText: 'Please provide your email template:',
        questionType: 'text',
        helperText: 'Use {name}, {company}, {title} for personalization',
      },
    ],
    whatsapp: [
      {
        intentKey: 'whatsapp_message_type',
        questionText: 'What type of WhatsApp message would you like to send?',
        questionType: 'select',
        options: [
          { label: 'Text message', value: 'text' },
          { label: 'Template message', value: 'template' },
          { label: 'Media message (image/video)', value: 'media' },
        ],
        helperText: 'Select the WhatsApp message type',
      },
      {
        intentKey: 'whatsapp_template',
        questionText: 'Please provide your WhatsApp message template:',
        questionType: 'text',
        dependsOn: { key: 'whatsapp_message_type', equals: ['text', 'template'] },
        helperText: 'Use {name}, {company} for personalization',
      },
    ],
    voice: [
      {
        intentKey: 'voice_enabled',
        questionText: 'Would you like to include voice agent calls in your campaign?',
        questionType: 'boolean',
        helperText: 'Voice agents can make automated calls to your leads',
      },
      {
        intentKey: 'voice_script',
        questionText: 'Please provide the voice agent script or key talking points:',
        questionType: 'text',
        dependsOn: { key: 'voice_enabled', equals: true },
        helperText: 'The voice agent will use this script for calls',
      },
    ],
  };
  /**
   * Common follow-up questions for all platforms
   */
  static COMMON_QUESTIONS = [
    {
      intentKey: 'campaign_name',
      questionText: 'What would you like to name this campaign?',
      questionType: 'text',
      helperText: 'Choose a memorable name for your campaign',
    },
    {
      intentKey: 'delay_between_steps',
      questionText: 'How much time should pass between each outreach step?',
      questionType: 'select',
      options: [
        { label: '1 hour', value: '1h' },
        { label: '1 day', value: '1d' },
        { label: '2 days', value: '2d' },
        { label: '1 week', value: '1w' },
        { label: 'Custom', value: 'custom' },
      ],
      helperText: 'This helps avoid overwhelming your leads',
    },
  ];
  /**
   * Analyze inbound lead data using Gemini AI
   */
  static async analyzeInboundData(inboundData, tenantId) {
    try {
      // Determine available platforms based on data
      const availablePlatforms = [];
      const missingPlatforms = [];
      const platformDetails = [];
      // Check LinkedIn
      const linkedinData = (inboundData.linkedinProfiles || []).filter(p => p && p.trim());
      if (linkedinData.length > 0) {
        availablePlatforms.push('linkedin');
        platformDetails.push({
          platform: 'linkedin',
          hasData: true,
          dataCount: linkedinData.length,
          sampleData: linkedinData.slice(0, 2),
        });
      } else {
        missingPlatforms.push('linkedin');
        platformDetails.push({
          platform: 'linkedin',
          hasData: false,
          dataCount: 0,
        });
      }
      // Check Email
      const emailData = (inboundData.emailIds || []).filter(e => e && e.trim());
      if (emailData.length > 0) {
        availablePlatforms.push('email');
        platformDetails.push({
          platform: 'email',
          hasData: true,
          dataCount: emailData.length,
          sampleData: emailData.slice(0, 2).map(e => this.maskEmail(e)),
        });
      } else {
        missingPlatforms.push('email');
        platformDetails.push({
          platform: 'email',
          hasData: false,
          dataCount: 0,
        });
      }
      // Check WhatsApp
      const whatsappData = (inboundData.whatsappNumbers || []).filter(w => w && w.trim());
      if (whatsappData.length > 0) {
        availablePlatforms.push('whatsapp');
        platformDetails.push({
          platform: 'whatsapp',
          hasData: true,
          dataCount: whatsappData.length,
          sampleData: whatsappData.slice(0, 2).map(n => this.maskPhone(n)),
        });
      } else {
        missingPlatforms.push('whatsapp');
        platformDetails.push({
          platform: 'whatsapp',
          hasData: false,
          dataCount: 0,
        });
      }
      // Check Phone (Voice)
      const phoneData = (inboundData.phoneNumbers || []).filter(p => p && p.trim());
      if (phoneData.length > 0) {
        availablePlatforms.push('voice');
        platformDetails.push({
          platform: 'voice',
          hasData: true,
          dataCount: phoneData.length,
          sampleData: phoneData.slice(0, 2).map(n => this.maskPhone(n)),
        });
      } else {
        missingPlatforms.push('voice');
        platformDetails.push({
          platform: 'voice',
          hasData: false,
          dataCount: 0,
        });
      }
      // Generate suggested questions based on available platforms
      const suggestedQuestions = this.generateSuggestedQuestions(availablePlatforms);
      // Generate validation summary using Gemini (optional enhancement)
      let validationSummary = `Found ${availablePlatforms.length} available platform(s) with data.`;
      if (availablePlatforms.length > 0) {
        validationSummary += ` You can reach out via ${availablePlatforms.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(', ')}.`;
      }
      if (missingPlatforms.length > 0) {
        validationSummary += ` Missing data for ${missingPlatforms.join(', ')}.`;
      }
      // Try to get enhanced analysis from Gemini
      try {
        const geminiAnalysis = await this.getGeminiAnalysis(inboundData, availablePlatforms, missingPlatforms);
        if (geminiAnalysis.summary) {
          validationSummary = geminiAnalysis.summary;
        }
        if (geminiAnalysis.additionalQuestions) {
          suggestedQuestions.push(...geminiAnalysis.additionalQuestions);
        }
      } catch (error) {
        logger.warn('Gemini analysis failed, using fallback', { error: error.message });
      }
      return {
        availablePlatforms,
        missingPlatforms,
        platformDetails,
        suggestedQuestions,
        validationSummary,
      };
    } catch (error) {
      logger.error('Error analyzing inbound data', { error });
      throw error;
    }
  }
  /**
   * Generate suggested questions for available platforms
   */
  static generateSuggestedQuestions(availablePlatforms) {
    const questions = [];
    for (const platform of availablePlatforms) {
      const platformQuestions = this.PLATFORM_QUESTIONS[platform] || [];
      // Add first question for each platform
      if (platformQuestions.length > 0) {
        const firstQ = platformQuestions[0];
        questions.push({
          platform,
          question: firstQ.questionText,
          intentKey: firstQ.intentKey,
        });
      }
    }
    return questions;
  }
  /**
   * Get enhanced analysis from Gemini AI
   */
  static async getGeminiAnalysis(inboundData, availablePlatforms, missingPlatforms) {
    const prompt = `Analyze this inbound lead data and provide a brief summary:
Company: ${inboundData.companyName}
Available contact methods: ${availablePlatforms.join(', ')}
Missing contact methods: ${missingPlatforms.join(', ')}
Notes: ${inboundData.notes || 'None'}
LinkedIn profiles: ${(inboundData.linkedinProfiles || []).filter(p => p).length}
Email addresses: ${(inboundData.emailIds || []).filter(e => e).length}
WhatsApp numbers: ${(inboundData.whatsappNumbers || []).filter(w => w).length}
Phone numbers: ${(inboundData.phoneNumbers || []).filter(p => p).length}
Provide a JSON response with:
1. "summary": A brief, friendly summary of what outreach channels are available
2. "recommendations": Any recommendations for the campaign setup
3. "additionalQuestions": Array of any additional questions that might be helpful (optional)
Response in JSON format only:`;
    try {
      const text = await GeminiClient.generateContent(prompt);
      // Try to parse JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return { summary: null, additionalQuestions: [] };
    } catch (error) {
      logger.warn('Gemini analysis parsing failed', { error: error.message });
      return { summary: null, additionalQuestions: [] };
    }
  }
  /**
   * Get next question based on collected answers
   */
  static async getNextQuestion(inboundData, analysis, collectedAnswers, currentStepIndex, tenantId) {
    try {
      const availablePlatforms = analysis.availablePlatforms || [];
      const allQuestions = [];
      // Build question queue for all available platforms
      for (const platform of availablePlatforms) {
        const platformQuestions = this.PLATFORM_QUESTIONS[platform] || [];
        for (const q of platformQuestions) {
          // Check if question should be skipped based on dependencies
          if (q.dependsOn) {
            const dependentValue = collectedAnswers[q.dependsOn.key];
            if (q.dependsOn.contains && Array.isArray(dependentValue)) {
              if (!dependentValue.includes(q.dependsOn.contains)) {
                continue; // Skip this question
              }
            }
            if (q.dependsOn.equals !== undefined) {
              if (Array.isArray(q.dependsOn.equals)) {
                if (!q.dependsOn.equals.includes(dependentValue)) {
                  continue;
                }
              } else if (dependentValue !== q.dependsOn.equals) {
                continue;
              }
            }
          }
          // Check if already answered
          if (!collectedAnswers[q.intentKey]) {
            allQuestions.push({
              ...q,
              platform,
              stepIndex: allQuestions.length + 1,
            });
          }
        }
      }
      // Add common questions at the end
      for (const q of this.COMMON_QUESTIONS) {
        if (!collectedAnswers[q.intentKey]) {
          allQuestions.push({
            ...q,
            stepIndex: allQuestions.length + 1,
          });
        }
      }
      // Find next unanswered question
      if (allQuestions.length === 0) {
        return {
          success: true,
          completed: true,
          message: 'All questions have been answered! Your campaign is ready to be created.',
        };
      }
      const nextQuestion = allQuestions[0];
      return {
        success: true,
        nextQuestion: {
          stepIndex: currentStepIndex + 1,
          intentKey: nextQuestion.intentKey,
          questionText: nextQuestion.questionText,
          questionType: nextQuestion.questionType,
          options: nextQuestion.options,
          platform: nextQuestion.platform,
          helperText: nextQuestion.helperText,
          validation: {
            required: true,
          },
        },
        totalSteps: allQuestions.length + Object.keys(collectedAnswers).length,
      };
    } catch (error) {
      logger.error('Error getting next question', { error });
      throw error;
    }
  }
  /**
   * Process user answer for inbound flow
   */
  static async processInboundAnswer(
    inboundData,
    analysis,
    collectedAnswers,
    currentStepIndex,
    currentIntentKey,
    userAnswer,
    tenantId
  ) {
    try {
      // Update collected answers
      const updatedAnswers = {
        ...collectedAnswers,
        [currentIntentKey]: userAnswer,
      };
      // Get next question
      const nextQuestionResult = await this.getNextQuestion(
        inboundData,
        analysis,
        updatedAnswers,
        currentStepIndex,
        tenantId
      );
      return {
        success: true,
        ...nextQuestionResult,
        updatedCollectedAnswers: updatedAnswers,
      };
    } catch (error) {
      logger.error('Error processing inbound answer', { error });
      throw error;
    }
  }
  /**
   * Mask email for privacy (show only first 2 chars)
   */
  static maskEmail(email) {
    if (!email) return '';
    const [local, domain] = email.split('@');
    if (!domain) return email;
    return `${local.substring(0, 2)}***@${domain}`;
  }
  /**
   * Mask phone for privacy (show last 4 digits)
   */
  static maskPhone(phone) {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 4) return phone;
    return `***${cleaned.slice(-4)}`;
  }
}
module.exports = InboundDataService;