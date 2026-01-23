# Location and Decision Makers Classification Feature

## Overview
This feature extends the existing AI ICP Assistant to provide intelligent classification and options for location (with spelling correction) and decision makers questions, similar to the industry question.

## What Was Implemented

### 1. **GeminiLocationClassifier Service**
   - **File**: `lad-feature-ai-icp-assistant/backend/features/ai-icp-assistant/services/GeminiLocationClassifier.js`
   - **Purpose**: Classifies and corrects location inputs using Gemini AI
   - **Features**:
     - Spelling correction (e.g., "Dubay" → "Dubai", "Bangalor" → "Bangalore")
     - Country abbreviation expansion (e.g., "USA" → "United States", "UAE" → "United Arab Emirates")
     - Provides alternative location suggestions
     - Fallback mechanism when API is unavailable
     - Autocomplete suggestions endpoint

### 2. **GeminiDecisionMakersClassifier Service**
   - **File**: `lad-feature-ai-icp-assistant/backend/features/ai-icp-assistant/services/GeminiDecisionMakersClassifier.js`
   - **Purpose**: Classifies and standardizes decision maker roles using Gemini AI
   - **Features**:
     - Role standardization (e.g., "chief exec" → "CEO", "mktg manager" → "Marketing Manager")
     - Categorizes roles (C-Level, VP-Level, Director, Head, Manager, Founder, Owner)
     - Provides alternative role suggestions
     - Fallback mechanism when API is unavailable
     - Autocomplete suggestions endpoint

### 3. **Updated AI ICP Assistant Service**
   - **File**: `lad-feature-ai-icp-assistant/backend/features/ai-icp-assistant/services/ai-icp-assistant.service.js`
   - **Changes**:
     - Added location classification for Step 2 (icp_locations)
     - Added decision makers classification for Step 3 (icp_roles)
     - Implements confirmation flow with clickable options
     - Handles user selection of primary or alternative suggestions
     - Allows users to type different answers if suggestions don't match

### 4. **Updated Industry Classification Controller**
   - **File**: `lad-feature-ai-icp-assistant/backend/features/ai-icp-assistant/controllers/IndustryClassificationController.js`
   - **New Methods**:
     - `classifyLocation()` - Classifies location input
     - `getLocationSuggestions()` - Returns location autocomplete suggestions
     - `classifyDecisionMakers()` - Classifies decision maker input
     - `getDecisionMakerSuggestions()` - Returns role autocomplete suggestions

### 5. **Updated Routes**
   - **File**: `lad-feature-ai-icp-assistant/backend/features/ai-icp-assistant/routes/ai-icp-assistant.routes.js`
   - **New Endpoints**:
     - `POST /api/ai-icp-assistant/classify-location` - Classify location with spelling correction
     - `GET /api/ai-icp-assistant/location-suggestions` - Get location suggestions
     - `POST /api/ai-icp-assistant/classify-decision-makers` - Classify decision makers
     - `GET /api/ai-icp-assistant/decision-maker-suggestions` - Get role suggestions

## How It Works

### User Flow for Location (Step 2):

1. **User types location**: e.g., "Dubay" or "USA"
2. **AI Classification**: Gemini AI analyzes and corrects:
   - "Dubay" → "Dubai" (spelling correction)
   - "USA" → "United States" (abbreviation expansion)
3. **Show Options**: System displays:
   ```
   ✅ I found your location: **Dubai**
   
   I corrected the spelling from "Dubay" to "Dubai".
   
   Please select the correct location:
   
   Options:
   • ✓ Dubai (Recommended)
   • United Arab Emirates
   • Type different location
   ```
4. **User Confirms**: User clicks/types their choice
5. **System Saves**: Location is saved and moves to next question

### User Flow for Decision Makers (Step 3):

1. **User types role**: e.g., "chief exec" or "mktg head"
2. **AI Classification**: Gemini AI standardizes:
   - "chief exec" → "CEO"
   - "mktg head" → "Head of Marketing"
3. **Show Options**: System displays:
   ```
   ✅ I found your target role: **CEO**
   
   I standardized "chief exec" to "CEO".
   
   Please select the correct decision maker:
   
   Options:
   • ✓ CEO (Recommended)
   • Founder
   • Managing Director
   • Type different role
   ```
4. **User Confirms**: User selects their choice
5. **System Saves**: Role is saved and moves to next question

## API Endpoints

### Location Classification
**POST** `/api/ai-icp-assistant/classify-location`
```json
Request:
{
  "location_input": "Dubay"
}

Response:
{
  "success": true,
  "primary_location": "Dubai",
  "confidence": "high",
  "reasoning": "I corrected the spelling from 'Dubay' to 'Dubai'.",
  "alternative_locations": ["United Arab Emirates"],
  "original_input": "Dubay"
}
```

### Decision Makers Classification
**POST** `/api/ai-icp-assistant/classify-decision-makers`
```json
Request:
{
  "decision_makers_input": "chief exec"
}

Response:
{
  "success": true,
  "primary_role": "CEO",
  "confidence": "high",
  "reasoning": "I standardized 'chief exec' to 'CEO'.",
  "alternative_roles": ["Founder", "Managing Director"],
  "role_category": "C-Level",
  "original_input": "chief exec"
}
```

## Benefits

1. **Better User Experience**: Users get instant feedback on their input with suggestions
2. **Spelling Correction**: Automatically fixes common typos and misspellings
3. **Standardization**: Ensures consistent data (e.g., "CEO" instead of various formats)
4. **Guided Selection**: Users can choose from alternatives if AI suggestion isn't perfect
5. **Flexibility**: Users can always type a different answer if needed

## Testing

To test the feature:

1. Start the backend server
2. Navigate to the ICP onboarding flow
3. For Step 2 (Location):
   - Try: "Dubay", "USA", "Londan", "UK"
   - Verify spelling correction and suggestions
4. For Step 3 (Decision Makers):
   - Try: "chief exec", "mktg manager", "vp sales", "cofounder"
   - Verify role standardization and suggestions

## Notes

- All classifiers use Gemini 2.0 Flash Exp model
- Fallback mechanisms ensure functionality even if API fails
- Same confirmation pattern as industry question for consistency
- Spelling corrections are automatically applied for locations
- Role categorization helps organize decision makers by level
