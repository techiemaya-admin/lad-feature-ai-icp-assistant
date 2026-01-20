/**
 * Leads Flow Handler
 * Handles the leads-based conversation flow where user uploads their own leads
 */

const LeadsTemplateService = require('./LeadsTemplateService');
const LeadsAnalyzerService = require('./LeadsAnalyzerService');
const GeminiResponseGenerator = require('./GeminiResponseGenerator');
const ResponseBuilder = require('./ResponseBuilder');
const logger = require('../utils/logger');

class LeadsFlowHandler {
  /**
   * Stage definitions for leads-based flow
   */
  static STAGES = {
    HAS_LEADS_CHECK: 'has_leads_check',         // Ask if user has own leads
    LEADS_UPLOAD: 'leads_upload',               // User uploads leads CSV
    LEADS_ANALYSIS: 'leads_analysis',           // AI analyzes leads
    PLATFORM_SELECTION: 'platform_selection',   // Select available platforms
    PLATFORM_ACTIONS: 'platform_actions',       // Configure actions per platform
    SEQUENCE_CONFIG: 'sequence_config',         // Configure sequence order/timing
    CONFIRMATION: 'confirmation'                // Final confirmation
  };

  /**
   * Handle the "do you have leads data" question
   * Called after user selects outbound
   */
  static async handleHasLeadsCheck(message, context, conversationHistory) {
    const lowerMessage = message.toLowerCase().trim();
    
    // Check for affirmative responses
    const hasLeads = this.extractYesNo(lowerMessage, 'has_leads');
    
    if (hasLeads === true) {
      context.hasLeadsData = true;
      context.stage = this.STAGES.LEADS_UPLOAD;
      
      const response = `Great! You have your own leads data. 📊

I'll help you set up a personalized outreach campaign based on your leads.

**Here's what to do:**
1. 📥 Download our template: Use the "Download Template" button below
2. ✏️ Fill in your leads data (at minimum: Name, and any contact info you have)
3. 📤 Upload the completed file

The more data you provide (email, phone, LinkedIn URL, company, title), the more outreach channels I can help you with.

**Click "Download Template" to get started!**`;
      
      return ResponseBuilder.collectingInfo(response, context, {
        showTemplate: true,
        templateUrl: '/api/ai-icp-assistant/leads/template',
        awaitingUpload: true
      });
    }
    
    if (hasLeads === false) {
      context.hasLeadsData = false;
      // Proceed with normal ICP discovery flow
      context.stage = 'outbound_target_knowledge';
      
      const response = `No problem! I'll help you discover and build your ideal prospect list. 🎯

Let me understand your target better. Do you:

**A) Already know** specific companies or people you want to reach?
**B) Need to discover** new prospects based on ideal customer criteria?`;
      
      return ResponseBuilder.collectingInfo(response, context);
    }
    
    // Clarification needed
    const response = `Before we proceed, I need to understand your situation:

**Do you already have a list of leads** (names, emails, LinkedIn profiles) that you want to reach out to?

- **Yes, I have leads** → I'll help you create a campaign for your existing contacts
- **No, I need to find leads** → I'll help you define your ideal customer and find new prospects`;
    
    return ResponseBuilder.collectingInfo(response, context);
  }

  /**
   * Handle leads upload completion
   * Called when user uploads a CSV file
   */
  static async handleLeadsUploaded(leadsData, platforms, analysis, context) {
    context.leadsData = leadsData;
    context.leadsAnalysis = analysis;
    context.availablePlatforms = platforms.available;
    context.unavailablePlatforms = platforms.unavailable;
    context.platformCoverage = platforms.coverage;
    context.stage = this.STAGES.LEADS_ANALYSIS;

    // Generate AI summary
    const summary = LeadsTemplateService.generateLeadsSummary(analysis, platforms);
    
    // Generate platform-specific questions only for available platforms
    const platformQuestions = LeadsAnalyzerService.generatePlatformQuestions(platforms);

    let response = `✅ **Leads Uploaded Successfully!**\n\n${summary}\n\n`;
    
    // Show what we can do based on available data
    if (platforms.available.length > 0) {
      response += `\n**Available Channels for Outreach:**\n`;
      platforms.available.forEach(platform => {
        const coverage = platforms.coverage[platform];
        const emoji = LeadsTemplateService.getPlatformEmoji(platform);
        response += `${emoji} ${platform.charAt(0).toUpperCase() + platform.slice(1)} - ${coverage.count}/${analysis.totalLeads} leads (${coverage.percentage}%)\n`;
      });
    }
    
    if (platforms.unavailable.length > 0) {
      response += `\n⚠️ **Not Available** (missing data): ${platforms.unavailable.join(', ')}\n`;
      response += `_You can enrich your data later to enable these channels._\n`;
    }
    
    response += `\nNow let's configure your outreach sequence. Which channels would you like to use?`;
    
    context.stage = this.STAGES.PLATFORM_SELECTION;
    
    return ResponseBuilder.collectingInfo(response, context, {
      platformQuestions,
      availablePlatforms: platforms.available,
      showPlatformSelector: true
    });
  }

  /**
   * Handle platform selection
   */
  static async handlePlatformSelection(selectedPlatforms, context, conversationHistory) {
    if (!selectedPlatforms || selectedPlatforms.length === 0) {
      const response = `Please select at least one channel for your outreach. Available options:\n\n` +
        context.availablePlatforms.map(p => {
          const coverage = context.platformCoverage[p];
          const emoji = LeadsTemplateService.getPlatformEmoji(p);
          return `${emoji} ${p.charAt(0).toUpperCase() + p.slice(1)} (${coverage.percentage}% coverage)`;
        }).join('\n');
      
      return ResponseBuilder.collectingInfo(response, context, {
        showPlatformSelector: true,
        availablePlatforms: context.availablePlatforms
      });
    }

    // Validate selected platforms are available
    const validPlatforms = selectedPlatforms.filter(p => 
      context.availablePlatforms.includes(p)
    );
    
    if (validPlatforms.length === 0) {
      const response = `The platforms you selected don't have data in your leads file. Please choose from:\n\n` +
        context.availablePlatforms.join(', ');
      
      return ResponseBuilder.collectingInfo(response, context, {
        showPlatformSelector: true
      });
    }

    context.selectedPlatforms = validPlatforms;
    context.stage = this.STAGES.PLATFORM_ACTIONS;

    // Generate questions for selected platforms only
    const platformsObj = {
      available: validPlatforms,
      unavailable: [],
      coverage: Object.fromEntries(
        validPlatforms.map(p => [p, context.platformCoverage[p]])
      )
    };
    
    const questions = LeadsAnalyzerService.generatePlatformQuestions(platformsObj);
    
    let response = `Great choices! You selected: ${validPlatforms.map(p => LeadsTemplateService.getPlatformEmoji(p) + ' ' + p).join(', ')}\n\n`;
    response += `Now let's configure each channel:\n\n`;
    
    // Ask first platform question
    if (questions.length > 0) {
      const firstQ = questions.find(q => q.platform === validPlatforms[0]);
      if (firstQ) {
        response += `**${firstQ.question}**\n`;
        if (firstQ.options) {
          firstQ.options.forEach((opt, i) => {
            response += `${i + 1}. ${opt.label}\n`;
          });
        }
      }
    }

    return ResponseBuilder.collectingInfo(response, context, {
      platformQuestions: questions,
      currentPlatform: validPlatforms[0],
      currentQuestionIndex: 0
    });
  }

  /**
   * Handle platform action configuration
   */
  static async handlePlatformActions(message, context, metadata) {
    const currentPlatform = metadata?.currentPlatform;
    const questions = metadata?.platformQuestions || [];
    
    if (!currentPlatform || !context.selectedPlatforms.includes(currentPlatform)) {
      // All platforms configured, move to sequence
      if (context.selectedPlatforms.length > 1) {
        context.stage = this.STAGES.SEQUENCE_CONFIG;
        return this.handleSequenceConfig(null, context);
      } else {
        context.stage = this.STAGES.CONFIRMATION;
        return this.generateFinalConfirmation(context);
      }
    }

    // Extract action from message
    const action = this.extractPlatformAction(message, currentPlatform);
    
    if (action) {
      if (!context.platformActions) context.platformActions = {};
      context.platformActions[currentPlatform] = action;
      
      // Move to next platform or sequence config
      const currentIndex = context.selectedPlatforms.indexOf(currentPlatform);
      const nextPlatform = context.selectedPlatforms[currentIndex + 1];
      
      if (nextPlatform) {
        const nextQ = questions.find(q => q.platform === nextPlatform);
        let response = `✅ ${currentPlatform} configured!\n\n`;
        
        if (nextQ) {
          response += `Now for **${nextPlatform}**:\n${nextQ.question}\n`;
          if (nextQ.options) {
            nextQ.options.forEach((opt, i) => {
              response += `${i + 1}. ${opt.label}\n`;
            });
          }
        }
        
        return ResponseBuilder.collectingInfo(response, context, {
          ...metadata,
          currentPlatform: nextPlatform
        });
      } else {
        // All platforms done
        if (context.selectedPlatforms.length > 1) {
          context.stage = this.STAGES.SEQUENCE_CONFIG;
          return this.handleSequenceConfig(null, context);
        } else {
          context.stage = this.STAGES.CONFIRMATION;
          return this.generateFinalConfirmation(context);
        }
      }
    }
    
    // Need clarification
    const currentQ = questions.find(q => q.platform === currentPlatform);
    let response = `I didn't catch that. For ${currentPlatform}, please choose:\n\n`;
    if (currentQ?.options) {
      currentQ.options.forEach((opt, i) => {
        response += `${i + 1}. ${opt.label}\n`;
      });
    }
    
    return ResponseBuilder.collectingInfo(response, context, metadata);
  }

  /**
   * Handle sequence configuration (order of platforms)
   */
  static async handleSequenceConfig(message, context) {
    if (!message) {
      // First time - show options
      const platforms = context.selectedPlatforms;
      let response = `You've selected multiple channels! Let's set up the sequence.\n\n`;
      response += `**What order would you like to reach out?**\n\n`;
      
      // Suggest a default sequence
      const defaultOrder = this.getRecommendedSequence(platforms);
      response += `**Recommended sequence:**\n`;
      defaultOrder.forEach((p, i) => {
        response += `${i + 1}. ${LeadsTemplateService.getPlatformEmoji(p)} ${p}\n`;
      });
      
      response += `\n_Reply with numbers to reorder (e.g., "2,1,3") or say "looks good" to confirm._`;
      
      context.sequenceOrder = defaultOrder;
      
      return ResponseBuilder.collectingInfo(response, context, {
        showSequenceConfig: true,
        suggestedOrder: defaultOrder
      });
    }
    
    const lowerMessage = message.toLowerCase();
    
    // Check for confirmation
    if (lowerMessage.includes('good') || lowerMessage.includes('confirm') || 
        lowerMessage.includes('yes') || lowerMessage.includes('ok')) {
      // Ask about delay
      let response = `✅ Sequence confirmed: ${context.sequenceOrder.map(p => LeadsTemplateService.getPlatformEmoji(p) + ' ' + p).join(' → ')}\n\n`;
      response += `**How many days between each touchpoint?**\n`;
      response += `(Recommended: 2-3 days for best results)\n`;
      
      return ResponseBuilder.collectingInfo(response, context, {
        awaitingDelay: true
      });
    }
    
    // Check for number sequence
    const numbers = message.match(/\d+/g);
    if (numbers && numbers.length > 0) {
      // Check if it's a delay number
      if (numbers.length === 1 && parseInt(numbers[0]) <= 14) {
        context.delayBetween = parseInt(numbers[0]);
        context.stage = this.STAGES.CONFIRMATION;
        return this.generateFinalConfirmation(context);
      }
      
      // It's a reorder
      const newOrder = [];
      const platforms = context.selectedPlatforms;
      numbers.forEach(n => {
        const idx = parseInt(n) - 1;
        if (idx >= 0 && idx < platforms.length) {
          newOrder.push(platforms[idx]);
        }
      });
      
      if (newOrder.length === platforms.length) {
        context.sequenceOrder = newOrder;
        let response = `Updated sequence: ${newOrder.map(p => LeadsTemplateService.getPlatformEmoji(p) + ' ' + p).join(' → ')}\n\n`;
        response += `**How many days between each touchpoint?**\n`;
        
        return ResponseBuilder.collectingInfo(response, context, {
          awaitingDelay: true
        });
      }
    }
    
    // Clarification needed
    let response = `I didn't understand that. Please:\n`;
    response += `- Say "looks good" to confirm the sequence\n`;
    response += `- Or type numbers to reorder (e.g., "2,1,3")\n`;
    
    return ResponseBuilder.collectingInfo(response, context);
  }

  /**
   * Generate final confirmation
   */
  static generateFinalConfirmation(context) {
    const leadsCount = context.leadsData?.length || 0;
    const platforms = context.selectedPlatforms || [];
    const sequence = context.sequenceOrder || platforms;
    const delay = context.delayBetween || 2;

    let response = `🎯 **Campaign Summary**\n\n`;
    response += `📊 **Leads:** ${leadsCount} contacts\n`;
    
    if (context.leadsAnalysis?.industries?.length > 0) {
      response += `🏢 **Top Industry:** ${context.leadsAnalysis.industries[0].name}\n`;
    }
    
    response += `\n**Outreach Sequence:**\n`;
    sequence.forEach((p, i) => {
      const emoji = LeadsTemplateService.getPlatformEmoji(p);
      const action = context.platformActions?.[p] || 'default';
      const dayNumber = i * delay;
      response += `Day ${dayNumber}: ${emoji} ${p.charAt(0).toUpperCase() + p.slice(1)} - ${action}\n`;
    });
    
    response += `\n⏱️ **Delay between steps:** ${delay} days\n`;
    
    // Platform coverage summary
    response += `\n**Coverage:**\n`;
    platforms.forEach(p => {
      const coverage = context.platformCoverage?.[p];
      if (coverage) {
        response += `• ${p}: ${coverage.count}/${leadsCount} leads (${coverage.percentage}%)\n`;
      }
    });
    
    response += `\n✅ **Ready to launch?** Say "confirm" to create this campaign or "edit" to make changes.`;
    
    context.stage = this.STAGES.CONFIRMATION;
    context.status = 'awaiting_confirmation';
    
    return ResponseBuilder.awaitingConfirmation(response, context);
  }

  /**
   * Helper: Extract yes/no from message
   */
  static extractYesNo(message, context = '') {
    const lowerMessage = message.toLowerCase();
    
    const yesPatterns = [
      'yes', 'yeah', 'yep', 'yup', 'sure', 'definitely', 'absolutely',
      'i have', 'have leads', 'have data', 'have a list', 'got leads',
      'already have', 'have my own'
    ];
    
    const noPatterns = [
      'no', 'nope', 'not', "don't", "dont", "haven't", "havent",
      "don't have", "need to find", "need leads", "no leads",
      "discover", "find new"
    ];
    
    if (yesPatterns.some(p => lowerMessage.includes(p))) {
      return true;
    }
    
    if (noPatterns.some(p => lowerMessage.includes(p))) {
      return false;
    }
    
    return null;
  }

  /**
   * Helper: Extract platform action from message
   */
  static extractPlatformAction(message, platform) {
    const lowerMessage = message.toLowerCase();
    const num = message.match(/^\d+$/);
    
    const platformActions = {
      linkedin: ['connection_request', 'inmail', 'profile_view', 'follow'],
      email: ['cold_email', 'nurture_sequence', 'single_email'],
      voice: ['cold_call', 'follow_up_call', 'voicemail', 'no_calls'],
      whatsapp: ['whatsapp_message', 'whatsapp_followup', 'no_whatsapp']
    };
    
    const actions = platformActions[platform] || [];
    
    // Check by number
    if (num && actions[parseInt(num[0]) - 1]) {
      return actions[parseInt(num[0]) - 1];
    }
    
    // Check by keyword
    for (const action of actions) {
      if (lowerMessage.includes(action.replace(/_/g, ' ')) || 
          lowerMessage.includes(action.replace(/_/g, ''))) {
        return action;
      }
    }
    
    // Check partial matches
    if (platform === 'linkedin') {
      if (lowerMessage.includes('connect')) return 'connection_request';
      if (lowerMessage.includes('mail') || lowerMessage.includes('inmail')) return 'inmail';
      if (lowerMessage.includes('view')) return 'profile_view';
      if (lowerMessage.includes('follow')) return 'follow';
    }
    
    if (platform === 'email') {
      if (lowerMessage.includes('cold')) return 'cold_email';
      if (lowerMessage.includes('nurture') || lowerMessage.includes('sequence')) return 'nurture_sequence';
      if (lowerMessage.includes('single')) return 'single_email';
    }
    
    return null;
  }

  /**
   * Helper: Get recommended sequence based on platforms
   */
  static getRecommendedSequence(platforms) {
    const priority = ['linkedin', 'email', 'voice', 'whatsapp', 'twitter'];
    return platforms.sort((a, b) => priority.indexOf(a) - priority.indexOf(b));
  }
}

module.exports = LeadsFlowHandler;
