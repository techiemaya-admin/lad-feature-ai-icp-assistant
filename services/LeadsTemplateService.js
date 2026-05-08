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
    { key: 'first_name', label: 'First Name', required: false, example: 'John' },
    { key: 'last_name', label: 'Last Name', required: false, example: 'Doe' },
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
    { key: 'twitter_url', label: 'Twitter/X URL', required: false, example: 'https://twitter.com/johndoe', platform: 'twitter' },
    { key: 'instagram_url', label: 'Instagram URL', required: false, example: 'https://instagram.com/johndoe', platform: 'instagram' },
    { key: 'facebook_url', label: 'Facebook URL', required: false, example: 'https://facebook.com/johndoe', platform: 'facebook' },
    { key: 'tiktok_url', label: 'TikTok URL', required: false, example: 'https://tiktok.com/@johndoe', platform: 'tiktok' }
  ];
  /**
   * Platform detection mapping
   */
  static PLATFORM_FIELDS = {
    linkedin: ['linkedin_url', 'linkedin_profile', 'linkedin'],
    email: ['email', 'email_address', 'work_email', 'personal_email'],
    voice: ['phone', 'phone_number', 'mobile', 'telephone', 'cell'],
    whatsapp: ['whatsapp', 'whatsapp_number', 'wa_number', 'phone', 'phone_number', 'mobile'],
    twitter: ['twitter_url', 'twitter', 'x_url'],
    instagram: ['instagram_url', 'instagram', 'ig_url', 'instagram_handle'],
    facebook: ['facebook_url', 'facebook', 'fb_url', 'facebook_profile'],
    tiktok: ['tiktok_url', 'tiktok', 'tiktok_handle']
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
        // Validate: accept any row that has at least one non-empty field
        const hasAnyField = Object.values(lead).some(v => v && v.trim() !== '');
        if (!hasAnyField) {
          errors.push(`Row ${i + 1}: All fields are empty`);
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
      'companysize': 'company_size',
      'instagramurl': 'instagram_url',
      'instagramprofile': 'instagram_url',
      'facebookurl': 'facebook_url',
      'facebookprofile': 'facebook_url',
      'tiktokurl': 'tiktok_url',
      'tiktokprofile': 'tiktok_url',
      'designation': 'job_title',
      'companywebsite': 'website'
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
    // Check for "enrichable" leads (name + company → all channels available)
    let enrichableCount = 0;
    for (const lead of leads) {
      const hasName = lead.first_name || lead.last_name || lead.name || lead.full_name;
      const hasCompany = lead.company || lead.website;
      if (hasName && hasCompany) enrichableCount++;
    }

    return {
      available,
      unavailable,
      coverage: platformCoverage,
      totalLeads,
      enrichableCount,
      allChannelsAvailable: enrichableCount > 0
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
   * Generate Excel (.xlsx) template using ExcelJS
   */
  static async generateExcelTemplate() {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'LAD - Lead Automation';
    const sheet = workbook.addWorksheet('Leads Template');

    // Add headers
    const headers = this.TEMPLATE_COLUMNS.map(col => col.label);
    const headerRow = sheet.addRow(headers);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1957' } };

    // Add example row
    const examples = this.TEMPLATE_COLUMNS.map(col => col.example);
    const exampleRow = sheet.addRow(examples);
    exampleRow.font = { italic: true, color: { argb: 'FF999999' } };

    // Set column widths
    sheet.columns.forEach((col, i) => {
      col.width = Math.max(headers[i].length, (examples[i] || '').length) + 4;
    });

    // Add 3 empty rows
    sheet.addRow([]);
    sheet.addRow([]);
    sheet.addRow([]);

    const buffer = await workbook.xlsx.writeBuffer();
    return {
      buffer,
      filename: 'leads_import_template.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };
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
      twitter: '🐦',
      instagram: '📷',
      facebook: '👤',
      tiktok: '🎵'
    };
    return emojis[platform] || '📱';
  }
}
module.exports = LeadsTemplateService;