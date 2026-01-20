/**
 * Context Manager
 * Handles context initialization, updates, and validation
 */

class ContextManager {
  /**
   * Initialize assistant context
   */
  static initializeContext() {
    return {
      stage: 'init',
      outreachType: null,
      inboundSource: null,
      inboundDataReady: null,
      captureRules: null,
      targetKnowledge: null,
      inferredStrategy: null,
      roles: [],
      industries: [],
      locations: [],
      companies: [],
      linkedinUrls: [],
      companySize: null,
      dealType: null,
      problemStatement: null,
      confidenceScore: 0,
      status: 'collecting_info',
      confirmed: false,
      // New leads-based flow fields
      hasLeadsData: null,           // true if user has their own leads
      leadsData: null,              // uploaded leads array
      leadsAnalysis: null,          // AI analysis of leads
      availablePlatforms: [],       // platforms detected from leads
      unavailablePlatforms: [],     // platforms missing from leads
      platformCoverage: {},         // coverage % per platform
      selectedPlatforms: [],        // user-selected platforms
      platformActions: {},          // selected actions per platform
      sequenceOrder: [],            // order of platform touchpoints
      delayBetween: 2               // days between touchpoints
    };
  }

  /**
   * Update context with new intent data
   */
  static updateContext(context, intentData, message) {
    const updated = { ...context };

    if (intentData.outreachType && (!updated.outreachType || intentData.confidenceScore > updated.confidenceScore)) {
      updated.outreachType = intentData.outreachType;
    }

    if (intentData.targetKnowledge && (!updated.targetKnowledge || intentData.confidenceScore > updated.confidenceScore)) {
      updated.targetKnowledge = intentData.targetKnowledge;
    }

    if (intentData.inferredStrategy && (!updated.inferredStrategy || intentData.confidenceScore > updated.confidenceScore)) {
      updated.inferredStrategy = intentData.inferredStrategy;
    }

    if (intentData.roles) {
      updated.roles = [...new Set([...updated.roles, ...intentData.roles])];
    }
    if (intentData.industries) {
      updated.industries = [...new Set([...updated.industries, ...intentData.industries])];
    }
    if (intentData.locations) {
      updated.locations = [...new Set([...updated.locations, ...intentData.locations])];
    }
    if (intentData.companies) {
      updated.companies = [...new Set([...updated.companies || [], ...intentData.companies])];
    }
    if (intentData.linkedinUrls) {
      updated.linkedinUrls = [...new Set([...updated.linkedinUrls, ...intentData.linkedinUrls])];
    }

    // Extract companies from message
    const companyPatterns = [
      /\b(company|companies|firm|firms|organization|organizations|business|businesses)\s+(?:named|called|like|such as|including)\s+([A-Z][a-zA-Z\s&]+)/gi,
      /\b([A-Z][a-zA-Z\s&]+)\s+(?:is|are|was|were)\s+(?:a|an|the)\s+(?:company|firm|organization|business)/gi
    ];
    
    if (!updated.companies || updated.companies.length === 0) {
      const extractedCompanies = [];
      companyPatterns.forEach(pattern => {
        const matches = message.match(pattern);
        if (matches) {
          extractedCompanies.push(...matches.map(m => m.trim()));
        }
      });
      if (extractedCompanies.length > 0) {
        updated.companies = [...new Set(extractedCompanies)];
      }
    }

    // Extract company size
    const sizeMatch = message.match(/\b(smb|small|mid.?market|mid market|enterprise|large|startup|scale.?up)\b/gi);
    if (sizeMatch && !updated.companySize) {
      const size = sizeMatch[0].toLowerCase();
      if (size.includes('smb') || size.includes('small') || size.includes('startup')) {
        updated.companySize = 'smb';
      } else if (size.includes('mid') || size.includes('scale')) {
        updated.companySize = 'mid-market';
      } else if (size.includes('enterprise') || size.includes('large')) {
        updated.companySize = 'enterprise';
      }
    }

    // Extract deal type
    const dealMatch = message.match(/\b(smb|small|mid.?market|enterprise)\b/gi);
    if (dealMatch && !updated.dealType) {
      const deal = dealMatch[0].toLowerCase();
      if (deal.includes('smb') || deal.includes('small')) {
        updated.dealType = 'smb';
      } else if (deal.includes('mid')) {
        updated.dealType = 'mid-market';
      } else if (deal.includes('enterprise')) {
        updated.dealType = 'enterprise';
      }
    }

    if (intentData.confidenceScore) {
      updated.confidenceScore = Math.max(updated.confidenceScore, intentData.confidenceScore);
    }

    return updated;
  }

  /**
   * Check if context has enough information
   */
  static isContextReady(context) {
    if (context.outreachType === 'inbound') {
      return context.inboundSource !== null && context.inboundDataReady !== null;
    }

    if (context.outreachType === 'outbound') {
      if (!context.targetKnowledge) {
        return false;
      }

      if (context.targetKnowledge === 'known') {
        const hasLinkedIn = context.linkedinUrls.length > 0;
        const hasCompanyRoleLocation = context.companies.length > 0 && context.roles.length > 0 && context.locations.length > 0;
        return hasLinkedIn || hasCompanyRoleLocation;
      }

      if (context.targetKnowledge === 'discovery') {
        return context.problemStatement && 
               context.roles.length > 0 && 
               context.industries.length > 0 && 
               context.locations.length > 0 &&
               context.companySize &&
               context.dealType;
      }
    }

    return false;
  }

  /**
   * Format context for AI prompts
   */
  static formatContextForAI(context) {
    const parts = [];
    if (context.outreachType) parts.push(`Outreach Type: ${context.outreachType}`);
    if (context.targetKnowledge) parts.push(`Target Knowledge: ${context.targetKnowledge}`);
    if (context.inferredStrategy) parts.push(`Strategy: ${context.inferredStrategy}`);
    if (context.roles.length > 0) parts.push(`Roles: ${context.roles.join(', ')}`);
    if (context.industries.length > 0) parts.push(`Industries: ${context.industries.join(', ')}`);
    if (context.locations.length > 0) parts.push(`Locations: ${context.locations.join(', ')}`);
    if (context.linkedinUrls.length > 0) parts.push(`LinkedIn URLs: ${context.linkedinUrls.length} provided`);
    return parts.join('\n') || 'No context yet';
  }
}

module.exports = ContextManager;

