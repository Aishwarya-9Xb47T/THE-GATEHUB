# Production-Grade Import Engine Architecture

## Objective
The AI is NOT a chatbot, summarizer, or content improver. The AI is ONLY a Question Extraction Engine. Its only job is to convert educational content into structured quiz questions.

## Supported Inputs
- PDF (including scanned)
- DOCX
- PPTX
- Google Docs
- Google Slides
- Google Forms
- Images
- Markdown
- TXT
- HTML
- Website URLs
- YouTube transcripts

## Pipeline Stages

### Stage 1: Raw Content Extraction
**NO AI. Use dedicated parsers.**

| Input | Parser/Library |
|-------|---------------|
| PDF | pdf.js, unstructured.io |
| DOCX | mammoth.js |
| PPTX | pptx-parser |
| HTML | cheerio, jsdom |
| Google Docs | Google Docs API |
| Google Slides | Google Slides API |
| Google Forms | Google Forms API |
| Images | Tesseract.js (OCR) |
| YouTube | youtube-transcript-api |
| Markdown | marked, unified |

**Output:** Raw text + layout information + media references

### Stage 2: Text Normalization
Remove:
- Headers and footers
- Page numbers
- Copyright notices
- Watermarks
- Navigation elements
- Repeated titles
- Empty paragraphs
- Duplicate text
- Table of contents
- Index
- References

**Output:** Cleaned text with structure preserved

### Stage 3: Educational Region Detection
Classify every paragraph as:
- Question
- Option
- Answer Key
- Explanation
- Heading (IGNORE)
- Subheading (IGNORE)
- Example (IGNORE)
- Theory (IGNORE)
- Diagram Caption (IGNORE)
- Formula (IGNORE)
- Table (IGNORE)
- Metadata (IGNORE)

**Only QUESTION REGIONS continue. Everything else is ignored.**

### Stage 4: Question Detection
Detect and classify:
- MCQ (Multiple Choice)
- True/False
- Fill in the Blanks
- Assertion Reason
- Match the Following
- Sequence
- Numerical
- Short Answer
- Long Answer
- Coding Questions
- Case Study Questions
- Multiple Correct
- Hotspot
- Diagram Questions
- Table Questions
- Scenario Questions

### Stage 5: Option Detection
Automatically detect option formats:
- A., B., C., D.
- •, -, *
- 1), 2), 3)
- a), b), c)
- Roman numerals (i, ii, iii)
- Checkboxes
- Radio buttons
- Google Forms format
- Moodle XML format
- Canvas format
- Blackboard format

### Stage 6: Answer Detection
Search for:
- Answer Key sections
- Correct Option markers
- ✔, ✓, *
- Bold answers
- Highlighted answers
- Green answers
- Teacher notes
- Appendix
- Solutions section

**Rule:** Never invent answers. If confidence < 95%, leave unanswered.

### Stage 7: Explanation Detection
Extract explanations separately. Never merge explanations into questions.

### Stage 8: Image Handling
If a question references:
- Figure, Diagram, Image, Graph, Chart, Table

Extract and attach the media to that question.

### Stage 9: OCR (for scanned PDFs)
If PDF is detected as scanned:
1. Run Tesseract.js OCR
2. Extract text with layout
3. Continue to Stage 2

### Stage 10: Layout Analysis
Handle:
- 2-column PDFs
- 3-column PDFs
- Rotated pages
- Mixed orientation
- Tables
- Math equations
- Handwritten scans

### Stage 11: Confidence Scoring
Every extracted question must have:
- Confidence score (0-100)
- Source page
- Bounding box
- Parser used
- OCR used
- AI used

### Stage 12: AI Extraction
**Prompt:**
```
You are an educational assessment extraction engine.

Your only task is to detect assessment questions.

Ignore all non-question content.

Return ONLY structured questions.

Do not rewrite.
Do not improve wording.
Do not summarize.
Do not invent answers.

Return JSON only.
```

### Stage 13: Validation
Before preview, verify:
- Question has stem
- MCQ has >= 2 options
- Answer exists if confidence high
- No duplicate questions
- No headings imported
- No theory imported
- No page numbers
- No empty questions

### Stage 14: Error Reporting
If extraction fails, show WHICH STAGE failed:
- Parser
- OCR
- Normalization
- Question Detection
- Answer Detection
- Validation

Never show generic "Preview not available" errors.

## Output Format
```json
{
  "quiz": {
    "title": "Extracted Quiz",
    "questions": [
      {
        "id": "q1",
        "stem": "Question text",
        "type": "mcq",
        "options": [
          { "id": "a", "text": "Option A", "isCorrect": false },
          { "id": "b", "text": "Option B", "isCorrect": true }
        ],
        "explanation": "Explanation text",
        "difficulty": "medium",
        "bloomLevel": "understanding",
        "images": ["image1.png"],
        "sourcePage": 5,
        "confidence": 95,
        "metadata": {
          "parser": "pdf.js",
          "ocrUsed": false,
          "boundingBox": { "x": 100, "y": 200, "width": 300, "height": 50 }
        }
      }
    ]
  },
  "errors": [],
  "warnings": []
}
```

## Preview
Show ONLY extracted questions. Never show raw document text. Teacher edits, approves, then creates the GateHub quiz.
