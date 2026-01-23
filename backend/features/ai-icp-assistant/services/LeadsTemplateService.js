/**
 * Leads Template Service
 * Generates CSV templates and parses uploaded lead data
 */
const logger = require('../utils/logger');
class LeadsTemplateService {
  /**
   * Template columns with metadata for smart detection
   */
  static TEMPLATE_COLUMNS = [
    { key: 'first_name', label: 'First Name', required: true, example: 'John' },
    { key: 'last_name', label: 'Last Name', required: true, example: 'Doe' },
    { key: 'email', label: 'Email', required: false, example: 'john.doe@company.com', platform: 'email' },
    { key: 'phone', label: 'Phone', required: false, example: '+1234567890', platform: 'voice' },
    { key: 'company', label: 'Company Name', required: false, example: 'TechCorp Inc.' },
    { key: 'job_title', label: 'Job Title', required: false, example: 'VP of Sales' },
    { key: 'industry', label: 'Industry', required: false, example: 'Technology' },
    { key: 'linkedin_url', label: 'LinkedIn URL', required: false, example: 'https://linkedin.com/in/johndoe', platform: 'linkedin' },
    { key: 'location', label: 'Location', required: false, example: 'New York, USA' },
    { key: 'company_size', label: 'Company Size', required: false, example: '51-200' },
    { key: 'website', label: 'Website', required: false, example: 'https://techcorp.com' },
    { key: 'notes', label: 'Notes', required: false, example: 'Met at conference' },
    { key: 'whatsapp', label: 'WhatsApp Number', required: false, example: '+1234567890', platform: 'whatsapp' },
    { key: 'twitter_url', label: 'Twitter/X URL', required: false, example: 'https://twitter.com/johndoe', platform: 'twitter' }
  ];
  /**
   * Platform detection mapping
   */
  static PLATFORM_FIELDS = {
    linkedin: ['linkedin_url', 'linkedin_profile', 'linkedin'],
    email: ['email', 'email_address', 'work_email', 'personal_email'],
    voice: ['phone', 'phone_number', 'mobile', 'telephone', 'cell'],
    whatsapp: ['whatsapp', 'whatsapp_number', 'wa_number'],
    twitter: ['twitter_url', 'twitter', 'x_url']
  };
  /**
   * Generate CSV template content
   */
  static generateTemplate() {
    const headers = this.TEMPLATE_COLUMNS.map(col => col.label);
    const examples = this.TEMPLATE_COLUMNS.map(col => col.example);
    const csvContent = [
      headers.join(','),
      examples.join(','),
      // Add empty rows for user to fill
      Array(headers.length).fill('').join(','),
      Array(headers.length).fill('').join(','),
      Array(headers.length).fill('').join(',')
    ].join('\n');
    return {
      content: csvContent,
      filename: 'leads_template.csv',
      mimeType: 'text/csv',
      columns: this.TEMPLATE_COLUMNS
    };
  }
  /**
   * Parse uploaded CSV data
   * @param {string} csvContent - Raw CSV content
   * @returns {Object} Parsed leads with platform detection
   */
  static parseCSV(csvContent) {
    try {
      const lines = csvContent.trim().split('\n');
      if (lines.length < 2) {
        throw new Error('CSV must have at least a header row and one data row');
      }
      const headers = this.parseCSVLine(lines[0]).map(h => this.normalizeHeader(h));
      const leads = [];
      const errors = [];
      for (let i = 1; i < lines.length; i++) {
        const values = this.parseCSVLine(lines[i]);
        if (values.every(v => !v || v.trim() === '')) continue; // Skip empty rows
        const lead = {};
        headers.forEach((header, index) => {
          lead[header] = values[index]?.trim() || '';
        });
        // Validate required fields
        const hasName = lead.first_name || lead.last_name || lead.name || lead.full_name;
        if (!hasName) {
          errors.push(`Row ${i + 1}: Missing name fields`);
          continue;
        }
        leads.push(lead);
      }
      return {
        success: true,
        leads,
        totalRows: lines.length - 1,
        validLeads: leads.length,
        errors,
        headers
      };
    } catch (error) {
      logger.error('[LeadsTemplateService] Parse error:', error);
      return {
        success: false,
        error: error.message,
        leads: [],
        validLeads: 0
      };
    }
  }
  /**
   * Parse a single CSV line handling quoted values
   */
  static parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }
  /**
   * Normalize header to standard key format
   */
  static normalizeHeader(header) {
    const normalized = header.toLowerCase()
      .replace(/['"]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
    // Map common variations
    const mappings = {
      'firstname': 'first_name',
      'lastname': 'last_name',
      'fullname': 'full_name',
      'emailaddress': 'email',
      'phonenumber': 'phone',
      'companyname': 'company',
      'jobtitle': 'job_title',
      'linkedinprofile': 'linkedin_url',
      'linkedinurl': 'linkedin_url',
      'companysize': 'company_size'
    };
    return mappings[normalized] || normalized;
  }
  /**
   * Detect available platforms from leads data
   * @param {Array} leads - Parsed leads array
   * @returns {Object} Platform availability analysis
   */
  static detectPlatforms(leads) {
    if (!leads || leads.length === 0) {
      return {
        available: [],
        unavailable: ['linkedin', 'email', 'voice', 'whatsapp'],
        coverage: {}
      };
    }
    const platformCoverage = {};
    const totalLeads = leads.length;
    // Check each platform
    for (const [platform, fields] of Object.entries(this.PLATFORM_FIELDS)) {
      let count = 0;
      for (const lead of leads) {
        const hasField = fields.some(field => {
          const value = lead[field];
          return value && value.trim() !== '';
        });
        if (hasField) count++;
      }
      platformCoverage[platform] = {
        count,
        percentage: Math.round((count / totalLeads) * 100),
        available: count > 0
      };
    }
    const available = Object.entries(platformCoverage)
      .filter(([, data]) => data.available)
      .map(([platform]) => platform);
    const unavailable = Object.entries(platformCoverage)
      .filter(([, data]) => !data.available)
      .map(([platform]) => platform);
    return {
      available,
      unavailable,
      coverage: platformCoverage,
      totalLeads
    };
  }
  /**
   * Analyze leads data for ICP insights
   * @param {Array} leads - Parsed leads array
   * @returns {Object} Analysis results
   */
  static analyzeLeadsData(leads) {
    if (!leads || leads.length === 0) {
      return { success: false, error: 'No leads to analyze' };
    }
    const analysis = {
      totalLeads: leads.length,
      industries: {},
      jobTitles: {},
      locations: {},
      companySizes: {},
      companies: new Set()
    };
    for (const lead of leads) {
      // Count industries
      if (lead.industry) {
        analysis.industries[lead.industry] = (analysis.industries[lead.industry] || 0) + 1;
      }
      // Count job titles
      if (lead.job_title) {
        analysis.jobTitles[lead.job_title] = (analysis.jobTitles[lead.job_title] || 0) + 1;
      }
      // Count locations
      if (lead.location) {
        analysis.locations[lead.location] = (analysis.locations[lead.location] || 0) + 1;
      }
      // Count company sizes
      if (lead.company_size) {
        analysis.companySizes[lead.company_size] = (analysis.companySizes[lead.company_size] || 0) + 1;
      }
      // Collect unique companies
      if (lead.company) {
        analysis.companies.add(lead.company);
      }
    }
    // Convert to sorted arrays
    const sortByCount = obj => Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count, percentage: Math.round((count / leads.length) * 100) }));
    return {
      success: true,
      totalLeads: leads.length,
      industries: sortByCount(analysis.industries).slice(0, 5),
      jobTitles: sortByCount(analysis.jobTitles).slice(0, 10),
      locations: sortByCount(analysis.locations).slice(0, 5),
      companySizes: sortByCount(analysis.companySizes),
      uniqueCompanies: analysis.companies.size,
      topCompanies: [...analysis.companies].slice(0, 10)
    };
  }
  /**
   * Generate AI summary of leads data
   * @param {Object} analysis - Analysis results from analyzeLeadsData
   * @param {Object} platforms - Platform detection results
   * @returns {string} Human-readable summary
   */
  static generateLeadsSummary(analysis, platforms) {
    const lines = [];
    // Lead count
    lines.push(`📊 **${analysis.totalLeads} leads** uploaded successfully.`);
    // Industry breakdown
    if (analysis.industries.length > 0) {
      const topIndustry = analysis.industries[0];
      lines.push(`🏢 Top industry: **${topIndustry.name}** (${topIndustry.percentage}%)`);
    }
    // Job titles
    if (analysis.jobTitles.length > 0) {
      const roles = analysis.jobTitles.slice(0, 3).map(j => j.name).join(', ');
      lines.push(`👤 Key roles: ${roles}`);
    }
    // Platform availability
    if (platforms.available.length > 0) {
      const platformText = platforms.available.map(p => {
        const coverage = platforms.coverage[p];
        return `${this.getPlatformEmoji(p)} ${p} (${coverage.percentage}%)`;
      }).join(', ');
      lines.push(`📱 Available channels: ${platformText}`);
    }
    if (platforms.unavailable.length > 0) {
      lines.push(`⚠️ Missing data for: ${platforms.unavailable.join(', ')}`);
    }
    return lines.join('\n');
  }
  /**
   * Get emoji for platform
   */
  static getPlatformEmoji(platform) {
    const emojis = {
      linkedin: '💼',
      email: '📧',
      voice: '📞',
      whatsapp: '💬',
      twitter: '🐦'
    };
    return emojis[platform] || '📱';
  }
}
module.exports = LeadsTemplateService;