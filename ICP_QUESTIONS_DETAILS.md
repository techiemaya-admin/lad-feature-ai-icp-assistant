# ICP Onboarding Questions - Full Details

This document lists all 7 questions asked during the Ideal Customer Profile (ICP) onboarding flow for lead generation.

---

## Step 1: Best Customers

**Title:** Best Customers  
**Question:** Who are your top 2–3 best customers?  
**Helper Text:** Example: Logistics companies, SaaS founders, Real estate developers  
**Type:** Text (free-form input)  
**Intent Key:** `ideal_customer`  
**Purpose:** Identifies the types of customers/clients that have been most successful for the business.

**What we're learning:**
- Industry verticals or customer segments
- Types of businesses that are a good fit
- Customer characteristics that lead to success

**Example Answers:**
- "Logistics companies, SaaS founders, Real estate developers"
- "E-commerce businesses with 50+ employees"
- "Healthcare providers in the UAE"

---

## Step 2: Most Profitable

**Title:** Most Profitable  
**Question:** Which of them brought you the most profit overall?  
**Helper Text:** Example: The client with repeat projects, not one-off work  
**Type:** Text (free-form input)  
**Intent Key:** `profitability`  
**Purpose:** Identifies which customer type generates the highest revenue or profit margins.

**What we're learning:**
- Revenue patterns (repeat vs. one-time)
- Customer lifetime value indicators
- Most profitable customer characteristics

**Example Answers:**
- "The logistics company with monthly retainer contracts"
- "SaaS founders who needed ongoing development work"
- "Real estate developers with multiple projects"

---

## Step 3: Easiest to Work With

**Title:** Easiest to Work With  
**Question:** Which one was the easiest to work with?  
**Helper Text:** Example: Clear decision-maker, paid on time, respected your process  
**Type:** Text (free-form input)  
**Intent Key:** `work_compatibility`  
**Purpose:** Identifies customer characteristics that make collaboration smooth and efficient.

**What we're learning:**
- Communication patterns
- Payment behavior
- Process alignment
- Decision-making structure

**Example Answers:**
- "The one with a single decision-maker who approved quickly"
- "Clients who paid invoices within 7 days"
- "Companies that followed our project management process"

---

## Step 4: Company Size

**Title:** Company Size  
**Question:** What size was the company?  
**Helper Text:** Example: 10–50 employees, 50–200 employees, 200+ employees  
**Type:** Select (single choice dropdown)  
**Intent Key:** `company_size`  
**Purpose:** Categorizes the ideal customer by company size (employee count).

**Options:**
1. **10–50** (value: `10-50`) - Small businesses
2. **50–200** (value: `50-200`) - Mid-size companies
3. **200+** (value: `200+`) - Large enterprises

**What we're learning:**
- Optimal company size for targeting
- Resource capacity of ideal customers
- Budget ranges typically associated with size

**Example Selection:**
- User selects: "50–200" → This indicates mid-size companies are the best fit

---

## Step 5: Value Alignment

**Title:** Value Alignment  
**Question:** Did they already value your service, or did you have to convince them?  
**Helper Text:** Example: They understood the value vs they only compared prices  
**Type:** Select (single choice dropdown)  
**Intent Key:** `value_alignment`  
**Purpose:** Determines whether ideal customers recognize value immediately or require education.

**Options:**
1. **They already valued our service** (value: `valued`) - Customers who understood the value proposition
2. **We had to convince them** (value: `convinced`) - Customers who needed education/persuasion

**What we're learning:**
- Sales cycle length (short vs. long)
- Customer education needs
- Value proposition fit
- Lead qualification criteria

**Example Selection:**
- User selects: "They already valued our service" → Indicates shorter sales cycles and better-qualified leads

---

## Step 6: Problem Feeler

**Title:** Problem Feeler  
**Question:** Who actually felt the problem you solved?  
**Helper Text:** Example: Operations team struggling with delays  
**Type:** Text (free-form input)  
**Intent Key:** `problem_feeler`  
**Purpose:** Identifies the specific person or team within the customer organization who experiences the pain point.

**What we're learning:**
- Target persona within companies
- Department/team that has the problem
- Job function of the problem owner
- Pain point location in the organization

**Example Answers:**
- "Operations team struggling with delivery delays"
- "Marketing managers overwhelmed with manual reporting"
- "Founders spending too much time on administrative tasks"
- "Finance team dealing with invoice processing bottlenecks"

---

## Step 7: Decision Maker Role

**Title:** Decision Maker Role  
**Question:** What was that person's role or title?  
**Helper Text:** Example: Operations Manager, Founder, Finance Head  
**Type:** Text (free-form input)  
**Intent Key:** `decision_maker_role`  
**Purpose:** Identifies the job title or role of the person who makes purchasing decisions.

**What we're learning:**
- Target job titles for outreach
- Decision-making hierarchy
- Persona characteristics
- LinkedIn search criteria

**Example Answers:**
- "Operations Manager"
- "Founder/CEO"
- "Finance Head"
- "VP of Marketing"
- "Head of Customer Success"

---

## Summary: What We Build From These Answers

After collecting all 7 answers, the system builds an Ideal Customer Profile (ICP) that includes:

1. **Customer Type** (`ideal_customer`) - Industry/segment to target
2. **Profitability Pattern** (`profitability`) - Revenue characteristics
3. **Work Style** (`work_compatibility`) - Collaboration preferences
4. **Company Size** (`company_size`) - Employee count range
5. **Sales Cycle** (`value_alignment`) - Education vs. immediate value
6. **Problem Owner** (`problem_feeler`) - Who feels the pain
7. **Decision Maker** (`decision_maker_role`) - Who approves purchases

This ICP is then used to:
- **Search for leads** (e.g., Apollo API searches)
- **Filter companies** by size, industry, location
- **Target personas** by job title and department
- **Qualify leads** based on value alignment patterns
- **Build workflows** for lead generation and outreach

---

## Question Flow Logic

The questions are asked sequentially (Step 1 → Step 2 → ... → Step 7), but Gemini AI can:
- **Skip steps** if user provides comprehensive answers early
- **Ask for clarification** if answers are vague
- **Detect completion** when enough information is gathered
- **Handle "back" commands** to revisit previous questions

All questions are stored in the database and can be edited without code changes.

---

## Database Schema Reference

Each question is stored with:
- `step_index`: Order (1-7)
- `title`: Short title
- `question`: Full question text
- `helper_text`: Examples/hints
- `intent_key`: Semantic identifier for Gemini
- `question_type`: Input type (text, select, multi-select, boolean)
- `options`: JSON array for select questions
- `category`: Question category (default: 'lead_generation')

