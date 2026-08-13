# GateHub Unified Import Engine Architecture

## Overview

This document describes the complete redesign of the GateHub Import Engine into a single, unified pipeline capable of handling all input formats and converting them directly into GateHub Quiz format.

## Design Principles

1. **Single Pipeline**: One ImportEngine class, no duplicate import paths
2. **AI-Only Extraction**: AI strictly extracts assessment questions, never summarizes or rewrites content
3. **Direct Quiz Builder Integration**: Imported quiz opens directly in Quiz Builder, no intermediate preview pages
4. **Confidence-Based Review**: Questions below 85% confidence are flagged for manual review
5. **Stage-Specific Error Handling**: Clear error messages indicating which stage failed
6. **Production-Ready**: No placeholders, full integration tests, >99% success rate

## Supported Input Formats

- **Documents**: PDF, DOCX, PPTX
- **Web**: Google Docs, Google Forms, Website URLs, YouTube transcripts
- **Structured**: CSV, Excel, Moodle XML
- **Text**: Markdown, TXT, HTML
- **Images**: PNG, JPG, JPEG (with OCR for scanned/handwritten content)

## Target Schema: GateHub Quiz

### Quiz Model (Prisma)
```typescript
{
  id: string (cuid)
  title: string
  description?: string
  subject?: string
  authorId: string
  visibility: string
  totalMarks: number
  metadata: {
    version: number
    settings: {
      shuffleQuestions: boolean
      shuffleOptions: boolean
      randomSubset: number
      timePerQuestion: number
      showExplanations: boolean
      passingScore: number
      maxAttempts: number
      negativeMarking: boolean
    }
    sections: Array<{id, title, order}>
    coverGradient?: string
    bannerUrl?: string
    thumbnailUrl?: string
  }
  pinned?: boolean
  favorited?: boolean
  archivedAt?: Date
  createdAt: Date
  updatedAt: Date
}
```

### Question Model (Prisma)
```typescript
{
  id: string (cuid)
  text: string
  type: "multiple_choice" | "multiple_select" | "true_false" | "short_answer"
  marks: number
  order: number
  difficulty: "easy" | "medium" | "hard"
  negativeMarks: number
  hint?: string
  bloomLevel: "L1" | "L2" | "L3" | "L4" | "L5" | "L6"
  explanation?: string
  metadata: {
    hints: string[]
    tags: string[]
    estimatedSeconds: number
    sectionId?: string
    media?: any
  }
  quizId: string
  createdAt: Date
  updatedAt: Date
}
```

### Option Model (Prisma)
```typescript
{
  id: string (cuid)
  text: string
  isCorrect: boolean
  order: number
  questionId: string
  createdAt: Date
}
```

## Pipeline Stages

### Stage 1: Source Type Detection
**Input**: File upload or URL
**Output**: SourceType enum
**Logic**:
- File extension detection for uploads
- URL pattern matching for web sources
- MIME type verification
- Returns: `pdf`, `docx`, `pptx`, `image`, `markdown`, `txt`, `html`, `csv`, `excel`, `moodle_xml`, `google_docs`, `google_forms`, `youtube`, `website`

### Stage 2: Raw Content Extraction
**Input**: SourceType + file/URL
**Output**: RawContent (text + images)
**Extractors**:
- PDF: pdf-parse (resolve Node.js 20 ESM compatibility)
- DOCX: mammoth
- PPTX: adm-zip + XML parsing
- Images: OpenAI Vision API + Tesseract.js fallback
- Markdown: marked + turndown
- TXT: direct read
- HTML: jsdom + turndown
- CSV: papaparse
- Excel: xlsx
- Moodle XML: xml2js
- Google Docs: Google Docs API
- Google Forms: Google Forms API
- YouTube: youtube-transcript-api
- Website: puppeteer

### Stage 3: Text Normalization
**Input**: RawContent
**Output**: NormalizedText
**Operations**:
- Remove headers, footers, page numbers
- Remove watermarks
- Remove table of contents
- Remove references/bibliographies
- Remove copyright notices
- Normalize whitespace
- Convert special characters to Unicode
- Preserve question structure and formatting

### Stage 4: Document Segmentation
**Input**: NormalizedText
**Output**: SegmentedContent (question blocks)
**Logic**:
- Detect question boundaries (numbering, bullet points, Q: prefixes)
- Separate question stems from options
- Identify answer keys
- Extract explanations
- Detect image references
- Group related content (question + options + answer + explanation)

### Stage 5: AI Question Extraction
**Input**: SegmentedContent
**Output**: ExtractedQuestionDraft[]
**AI Model**: OpenAI GPT-4o-mini
**Extraction Fields**:
- Question text (verbatim, no rewriting)
- Question type (multiple_choice, multiple_select, true_false, short_answer)
- Options (verbatim text)
- Correct answer(s)
- Explanation (if present)
- Difficulty (easy/medium/hard)
- Bloom's level (L1-L6)
- Tags (topic keywords)
- Confidence score (0-100)
- Warnings (ambiguity flags)

**AI Prompt Rules**:
- NEVER summarize or rewrite question text
- NEVER invent content not in source
- Extract EXACTLY what is present
- Mark low-confidence extractions
- Flag ambiguous answer keys

### Stage 6: Validation Engine
**Input**: ExtractedQuestionDraft[]
**Output**: ValidatedQuestionDraft[]
**Validation Rules**:
- Remove non-question content (headers, instructions, etc.)
- Remove duplicate questions (text similarity > 95%)
- Validate question type has required options
- Validate at least one correct answer exists
- Validate option count matches type (MC: 2+, MS: 2+, TF: 2, SA: 0)
- Confidence threshold: <85% flagged for review
- Mark questions with warnings

### Stage 7: Quiz Schema Conversion
**Input**: ValidatedQuestionDraft[]
**Output**: GateHubQuiz (ready for Prisma)
**Mapping**:
- ExtractedQuestionDraft → Question model
- Options → Option model
- Metadata → Question.metadata
- Auto-generate quiz title from source
- Set default settings
- Calculate totalMarks

### Stage 8: Quiz Creation
**Input**: GateHubQuiz
**Output**: QuizId
**Operation**:
- Create Quiz record via Prisma
- Create Question records
- Create Option records
- Return quizId for redirect to Quiz Builder

## Backend Architecture

### Directory Structure
```
backend/src/services/assessmentStudio/import/
├── ImportEngine.ts          # Main pipeline orchestrator
├── types.ts                 # TypeScript types
├── extractors/
│   ├── SourceDetector.ts    # Stage 1
│   ├── RawContentExtractor.ts  # Stage 2
│   ├── TextNormalizer.ts    # Stage 3
│   ├── DocumentSegmenter.ts # Stage 4
│   ├── AIQuestionExtractor.ts # Stage 5
│   ├── ValidationEngine.ts  # Stage 6
│   └── QuizConverter.ts     # Stage 7
├── parsers/
│   ├── PdfParser.ts
│   ├── DocxParser.ts
│   ├── PptxParser.ts
│   ├── ImageOcrParser.ts
│   ├── MarkdownParser.ts
│   ├── HtmlParser.ts
│   ├── CsvParser.ts
│   ├── ExcelParser.ts
│   ├── MoodleXmlParser.ts
│   ├── GoogleDocsParser.ts
│   ├── GoogleFormsParser.ts
│   ├── YoutubeParser.ts
│   └── WebsiteParser.ts
└── importService.ts         # Service layer wrapper
```

### Controller
**File**: `backend/src/controllers/assessmentStudioImportController.ts`
**Endpoint**: `POST /api/assessment-studio/import/analyze`
**Request**:
```typescript
{
  source: 'file' | 'url' | 'google_docs' | 'google_forms'
  file?: File
  url?: string
  googleAccessToken?: string
}
```
**Response**:
```typescript
{
  jobId: string
  status: 'processing' | 'completed' | 'failed'
  stage: string
  progress: number
  quizId?: string  // When completed
  error?: string   // When failed
}
```

### ImportEngine Class
```typescript
class ImportEngine {
  private jobId: string
  private userId: string
  private progressCallback: (stage: string, progress: number) => void

  async process(input: ImportInput): Promise<ImportResult>
  
  private async detectSourceType(): Promise<SourceType>
  private async extractRawContent(): Promise<RawContent>
  private async normalizeText(): Promise<NormalizedText>
  private async segmentDocument(): Promise<SegmentedContent>
  private async extractQuestionsAI(): Promise<ExtractedQuestionDraft[]>
  private async validateQuestions(): Promise<ValidatedQuestionDraft[]>
  private async convertToQuizSchema(): Promise<GateHubQuiz>
  private async createQuiz(): Promise<string>
}
```

## Frontend Architecture

### ImportWizard Component
**File**: `frontend/src/components/assessment-studio/ImportWizard.tsx`
**Features**:
- Single component for all import sources
- File upload with drag-and-drop
- URL input for web sources
- Google OAuth integration
- Live progress updates via polling
- Auto-redirect to Quiz Builder on completion
- Error display with stage information

### Quiz Builder Review Panel
**File**: `frontend/src/pages/instructor/QuizBuilderPage.tsx` (enhanced)
**Features**:
- Confidence score display per question
- Color-coded flags (green: >90%, yellow: 85-90%, red: <85%)
- Warning badges for ambiguous extractions
- Filter by confidence level
- Quick edit for flagged questions
- Accept/Reject workflow for low-confidence questions

## Error Handling

### Error Codes
```typescript
enum ImportErrorCode {
  SOURCE_DETECTION_FAILED = 'SOURCE_DETECTION_FAILED',
  EXTRACTION_FAILED = 'EXTRACTION_FAILED',
  NORMALIZATION_FAILED = 'NORMALIZATION_FAILED',
  SEGMENTATION_FAILED = 'SEGMENTATION_FAILED',
  AI_EXTRACTION_FAILED = 'AI_EXTRACTION_FAILED',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  CONVERSION_FAILED = 'CONVERSION_FAILED',
  QUIZ_CREATION_FAILED = 'QUIZ_CREATION_FAILED',
}
```

### Error Response Format
```typescript
{
  error: string
  stage: string  // Which stage failed
  code: ImportErrorCode
  details?: string
  recoverable: boolean
}
```

## Progress Reporting

### Stages with Progress Percentages
1. Source Type Detection: 0-5%
2. Raw Content Extraction: 5-20%
3. Text Normalization: 20-30%
4. Document Segmentation: 30-40%
5. AI Question Extraction: 40-70%
6. Validation: 70-85%
7. Quiz Schema Conversion: 85-95%
8. Quiz Creation: 95-100%

### Polling Endpoint
`GET /api/assessment-studio/import/status/:jobId`

## Migration Plan

### Phase 1: Create New Architecture
1. Create new ImportEngine class
2. Implement all extractors
3. Implement AI extraction with strict prompt rules
4. Implement validation engine
5. Implement quiz converter

### Phase 2: Integrate with Existing API
1. Update assessmentStudioImportController to use ImportEngine
2. Keep existing endpoint structure for compatibility
3. Add progress reporting

### Phase 3: Update Frontend
1. Enhance ImportWizard for progress polling
2. Add Review Panel to Quiz Builder
3. Implement auto-redirect to Quiz Builder

### Phase 4: Testing
1. Integration tests for all source types
2. End-to-end tests
3. Confidence scoring validation
4. Error handling tests

### Phase 5: Cleanup
1. Delete duplicate import components
2. Remove SimpleImportWizard
3. Archive old architecture docs
4. Update documentation

## Testing Strategy

### Integration Tests
- Test each source type independently
- Validate extraction accuracy (>99%)
- Test confidence scoring
- Test error handling per stage

### End-to-End Tests
1. Upload PDF → Extract → AI → Validate → Draft Quiz → Quiz Builder
2. Upload DOCX → ... → Quiz Builder
3. Google Forms import → ... → Quiz Builder
4. Image OCR import → ... → Quiz Builder
5. Website URL import → ... → Quiz Builder

### Success Criteria
- >99% successful extraction for all source types
- <5% false positive rate (non-questions marked as questions)
- <2% false negative rate (questions missed)
- Confidence scores correlate with manual review needs
- No data loss or content rewriting

## Performance Targets

- PDF extraction: <10 seconds for 50 pages
- DOCX extraction: <5 seconds
- Image OCR: <3 seconds per image
- AI extraction: <30 seconds for 100 questions
- Total pipeline: <60 seconds for typical imports

## Security Considerations

- File size limits: 50MB max
- Rate limiting: 10 imports per user per hour
- Virus scanning for uploads
- URL validation for web sources
- OAuth token encryption for Google APIs
- No persistent storage of raw content after processing

## Dependencies

### Backend
- pdf-parse (or pdfjs-dist for Node.js 20 compatibility)
- mammoth (DOCX)
- adm-zip (PPTX)
- openai (Vision API)
- tesseract.js (OCR fallback)
- marked, turndown (Markdown)
- jsdom (HTML)
- papaparse (CSV)
- xlsx (Excel)
- xml2js (Moodle XML)
- googleapis (Google Docs/Forms)
- youtube-transcript-api
- puppeteer (Websites)
- zod (Validation)
- prisma (Database)

### Frontend
- react-hook-form
- @tanstack/react-query
- lucide-react (Icons)
- shadcn/ui components

## Success Metrics

1. **Extraction Accuracy**: >99% questions correctly extracted
2. **False Positive Rate**: <5% non-questions marked as questions
3. **False Negative Rate**: <2% questions missed
4. **Confidence Correlation**: 90% of <85% confidence questions need manual review
5. **User Satisfaction**: >90% users rate import as "excellent" or "good"
6. **Time to Quiz**: <60 seconds average from upload to Quiz Builder
