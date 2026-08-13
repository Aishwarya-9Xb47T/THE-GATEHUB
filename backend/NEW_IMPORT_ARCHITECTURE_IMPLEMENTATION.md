# New Import Architecture - Implementation Summary

**Date:** 2026-07-27  
**Status:** Backend Complete, Frontend Pending

---

## Architecture Overview

The import system has been redesigned with Google Forms as the intermediate universal format.

```
User Content (PDF, DOCX, PPTX, HTML, Website, etc.)
↓
[Simplified Text Extractor] - Extract plain text ONLY
↓
[AI Extractor] - Extract questions in Google Forms format
↓
[Google Forms → GateHub Importer] - Convert to GateHub format
↓
[Quiz Builder] - Opens with pre-filled questions
```

---

## Files Created

### 1. `shared/googleFormsSchema.ts`
**Purpose:** Defines the intermediate universal format

**Key Types:**
- `GoogleForms` - Complete form structure
- `GoogleFormsSection` - Group of questions
- `GoogleFormsQuestion` - Individual question
- `GoogleFormsQuestionType` - Supported question types

**Key Functions:**
- `googleFormsToGateHubQuestion()` - Converts Google Forms to GateHub format
- `gateHubQuestionToGoogleForms()` - Reverse conversion

**Type Mappings:**
- TEXT → short_answer
- PARAGRAPH_TEXT → essay
- MULTIPLE_CHOICE → multiple_choice
- CHECKBOX → multiple_select
- DROPDOWN → multiple_choice
- LINEAR_SCALE → numerical
- IMAGE → image_based

---

### 2. `backend/src/services/assessmentStudio/googleFormsImporter.ts`
**Purpose:** The ONLY production-grade importer

**Key Functions:**
- `importGoogleFormsToGateHub()` - Imports Google Forms into BankQuestion
- `createQuizFromGoogleForms()` - Creates a Quiz with imported questions
- `convertGoogleFormsToGateHub()` - Converts individual questions

**Features:**
- Converts Google Forms question types to GateHub types
- Preserves points, sections, images
- Creates BankQuestion entries
- Creates Quiz with pre-filled questions

---

### 3. `backend/src/services/assessmentStudio/googleFormsAIExtractor.ts`
**Purpose:** Extracts questions and outputs Google Forms format

**Key Functions:**
- `extractQuestionsAsGoogleForms()` - Main extraction function
- `buildExtractionPrompt()` - Builds AI prompt
- `validateAndFixGoogleForms()` - Validates structure
- `heuristicExtractAsGoogleForms()` - Fallback when AI unavailable

**Features:**
- Uses OpenAI GPT-4o-mini with JSON response format
- Heuristic fallback when AI unavailable
- Validates and fixes Google Forms structure
- Extracts questions, options, correct answers, explanations

---

### 4. `backend/src/services/assessmentStudio/simplifiedTextExtractor.ts`
**Purpose:** Extracts plain text from any source

**Key Functions:**
- `extractPlainText()` - Unified extraction function

**Supported Sources:**
- Files: DOCX, PPTX, HTML, CSV, Moodle XML, TXT, Markdown
- URLs: Google Docs, Google Forms, Website, YouTube
- Direct: Text input

**Features:**
- Reuses existing extractors where available
- No complex parsing - just text extraction
- Delegates question extraction to AI

---

### 5. `backend/src/services/assessmentStudio/newImportPipeline.ts`
**Purpose:** Unified pipeline orchestrator

**Key Functions:**
- `runNewImportPipeline()` - Main pipeline function
- `previewGoogleForms()` - Preview without importing

**Pipeline Stages:**
1. Extract plain text
2. AI extraction to Google Forms format
3. Import into GateHub (BankQuestion or Quiz)

**Options:**
- `createQuiz` - Create a quiz directly
- `quizTitle` - Custom quiz title
- `quizDescription` - Custom quiz description
- `quizSubject` - Custom quiz subject

---

## Files Modified

### 1. `backend/src/controllers/assessmentStudioImportController.ts`
**Changes:**
- Added import for `runNewImportPipeline` and `previewGoogleForms`
- Added `analyzeImportNew()` - New import endpoint
- Added `previewImportNew()` - Preview endpoint

**New Endpoints:**
- `POST /api/assessment-studio/import/new/analyze` - Run new pipeline
- `POST /api/assessment-studio/import/new/preview` - Preview Google Forms

---

### 2. `backend/src/routes/assessmentStudio.ts`
**Changes:**
- Added routes for new pipeline
- `POST /import/new/analyze` - Analyze with new pipeline
- `POST /import/new/preview` - Preview with new pipeline

---

## API Endpoints

### New Pipeline Endpoints

#### `POST /api/assessment-studio/import/new/analyze`
**Purpose:** Run the new import pipeline

**Request:**
- `source` (string) - Import source type
- `file` (file, optional) - File upload
- `url` (string, optional) - URL for web sources
- `text` (string, optional) - Direct text input
- `createQuiz` (boolean, optional) - Create quiz directly
- `quizTitle` (string, optional) - Custom quiz title
- `quizDescription` (string, optional) - Custom quiz description
- `quizSubject` (string, optional) - Custom quiz subject

**Response:**
```json
{
  "success": true,
  "data": {
    "quizId": "string",  // if createQuiz=true
    "questionCount": number,
    "formTitle": "string"
  }
}
```

#### `POST /api/assessment-studio/import/new/preview`
**Purpose:** Preview Google Forms structure before importing

**Request:**
- Same as analyze endpoint (without quiz options)

**Response:**
```json
{
  "success": true,
  "data": {
    "formId": "string",
    "info": {
      "title": "string",
      "documentTitle": "string",
      "description": "string"
    },
    "items": [GoogleFormsSection]
  }
}
```

---

## Old Pipeline (Still Functional)

The old import pipeline remains functional:
- `POST /api/assessment-studio/import/analyze` - Old pipeline
- `GET /api/assessment-studio/import/jobs/:jobId` - Job status
- `PATCH /api/assessment-studio/import/jobs/:jobId` - Update preview
- `POST /api/assessment-studio/import/jobs/:jobId/commit` - Commit import

---

## Next Steps

### 1. Frontend Integration (Pending)
- Update `ImportWizard.tsx` to use new endpoints
- Add progress indicators for new pipeline stages
- Handle Google Forms preview structure
- Integrate with Quiz Builder for seamless opening

### 2. Testing (Pending)
- Test new pipeline with real files (DOCX, PDF, PPTX, etc.)
- Test AI extraction quality
- Test heuristic fallback
- Test Quiz Builder integration

### 3. Deprecation (Pending)
- Mark old pipeline as deprecated
- Add feature flag to switch between old and new
- Once stable, remove old pipeline

---

## Benefits

1. **Simplified Maintenance** - Only ONE production importer (Google Forms → GateHub)
2. **AI-Driven Quality** - AI handles question extraction quality
3. **Consistent Output** - All sources output the same format
4. **Seamless Integration** - Direct Quiz Builder integration
5. **Reduced Complexity** - No complex parsers per format

---

## Migration Path

1. **Phase 1** - Backend complete (current)
2. **Phase 2** - Frontend integration
3. **Phase 3** - Parallel testing
4. **Phase 4** - Feature flag rollout
5. **Phase 5** - Remove old pipeline

---

## Error Handling

All errors are logged with detailed context:
- `[new-import-pipeline]` - Pipeline level
- `[text-extractor]` - Text extraction level
- `[google-forms-ai]` - AI extraction level
- `[google-forms-importer]` - Import level
- `[controller][new-import]` - Controller level

This makes debugging straightforward.
