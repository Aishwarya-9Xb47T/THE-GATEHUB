# New Import Architecture

**Date:** 2026-07-27  
**Status:** Implemented

---

## Overview

The import system has been redesigned with Google Forms as the intermediate universal format. This simplifies the architecture and reduces maintenance burden.

---

## Old Architecture (Deprecated)

```
User Content
↓
[Separate parser for each source]
  - PDF parser
  - DOCX parser
  - PPTX parser
  - HTML parser
  - CSV parser
  - Moodle XML parser
  - Google Docs parser
  - Google Forms parser
  - Website parser
  - YouTube parser
  - etc.
↓
Complex validation and normalization
↓
GateHub Question Bank
```

**Problems:**
- 14+ separate parsers to maintain
- Complex validation logic per format
- High maintenance burden
- Inconsistent question extraction quality

---

## New Architecture

```
User Content (PDF, DOCX, PPTX, HTML, Website, etc.)
↓
[Simplified Text Extractor]
  - Extract plain text ONLY
  - No complex parsing
  - Reuses existing extractors where available
↓
[AI Extractor]
  - Extracts questions, options, answers
  - Outputs Google Forms-compatible JSON
  - Heuristic fallback when AI unavailable
↓
[Google Forms → GateHub Importer]
  - Converts Google Forms to GateHub format
  - Creates BankQuestion entries
  - Creates Quiz with pre-filled questions
↓
[Quiz Builder]
  - Opens with all questions pre-filled
  - Teacher reviews and edits
  - Publish
```

**Benefits:**
- Only ONE production importer (Google Forms → GateHub)
- AI handles question extraction quality
- Simplified maintenance
- Consistent output format
- Seamless Quiz Builder integration

---

## Components

### 1. Google Forms Schema (`shared/googleFormsSchema.ts`)

Defines the intermediate universal format:
- `GoogleForms` - Complete form structure
- `GoogleFormsSection` - Group of questions
- `GoogleFormsQuestion` - Individual question
- `googleFormsToGateHubQuestion()` - Conversion function
- `gateHubQuestionToGoogleForms()` - Reverse conversion

**Supported Question Types:**
- TEXT (Short Answer)
- PARAGRAPH_TEXT (Essay)
- MULTIPLE_CHOICE
- CHECKBOX
- DROPDOWN
- LINEAR_SCALE
- DATE
- TIME
- GRID
- CHECKBOX_GRID
- IMAGE

### 2. Google Forms Importer (`googleFormsImporter.ts`)

The ONLY production-grade importer:
- `importGoogleFormsToGateHub()` - Imports Google Forms into BankQuestion
- `createQuizFromGoogleForms()` - Creates a Quiz with imported questions
- Converts Google Forms question types to GateHub types
- Preserves points, sections, images

### 3. AI Extractor (`googleFormsAIExtractor.ts`)

Extracts questions and outputs Google Forms format:
- `extractQuestionsAsGoogleForms()` - Main extraction function
- Uses OpenAI GPT-4o-mini with JSON response format
- Heuristic fallback when AI unavailable
- Validates and fixes Google Forms structure

### 4. Simplified Text Extractor (`simplifiedTextExtractor.ts`)

Extracts plain text from any source:
- `extractPlainText()` - Unified extraction function
- Reuses existing extractors (DOCX, PPTX, HTML, etc.)
- No complex parsing - just text extraction
- Delegates question extraction to AI

---

## Type Mappings

### Google Forms → GateHub

| Google Forms Type | GateHub Type |
|------------------|--------------|
| TEXT | short_answer |
| PARAGRAPH_TEXT | essay |
| MULTIPLE_CHOICE | multiple_choice |
| CHECKBOX | multiple_select |
| DROPDOWN | multiple_choice |
| LINEAR_SCALE | numerical |
| DATE | short_answer |
| TIME | short_answer |
| GRID | matching |
| CHECKBOX_GRID | multiple_select |
| IMAGE | image_based |

### GateHub → Google Forms

| GateHub Type | Google Forms Type |
|-------------|------------------|
| short_answer | TEXT |
| essay | PARAGRAPH_TEXT |
| multiple_choice | MULTIPLE_CHOICE |
| multiple_select | CHECKBOX |
| true_false | MULTIPLE_CHOICE |
| fill_blank | TEXT |
| numerical | LINEAR_SCALE |
| matching | GRID |
| ordering | CHECKBOX |
| image_based | IMAGE |
| video_based | IMAGE |
| audio_based | IMAGE |

---

## User Experience

### Old Experience
1. Upload file
2. Wait for complex parsing
3. Preview questions
4. Manually copy to Quiz Builder
5. Edit and publish

### New Experience
1. Upload file
2. AI extracts questions
3. Quiz automatically appears in Quiz Builder with all questions pre-filled
4. Teacher reviews and edits
5. Publish

**Key Improvement:** No manual copying. Seamless integration with Quiz Builder.

---

## Implementation Status

✅ Google Forms schema designed  
✅ Type mappings defined  
✅ Google Forms → GateHub importer built  
✅ AI extractor outputs Google Forms format  
✅ Simplified text extractor created  
⏳ Quiz Builder integration (in progress)  
⏳ Deprecate old parsers (pending)

---

## Next Steps

1. **Integrate Quiz Builder** - Open Quiz Builder with pre-filled questions after import
2. **Update Frontend** - Modify ImportWizard to use new pipeline
3. **Deprecate Old Parsers** - Mark old import pipeline as deprecated
4. **Testing** - Test new pipeline with real files
5. **Documentation** - Update user documentation

---

## Migration Notes

- Old import pipeline remains functional during transition
- New pipeline can be tested in parallel
- Frontend can switch between old and new pipelines via feature flag
- Once stable, old pipeline can be removed
