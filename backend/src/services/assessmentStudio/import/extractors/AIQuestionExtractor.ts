/**
 * Stage 5: AI Question Extraction
 * Uses GPT-4o-mini to extract questions, options, answers, and metadata from segmented content
 * STRICT RULE: AI must only extract verbatim content - NO summarization, NO rewriting, NO invention
 */

import { SegmentedContent, ExtractedQuestionDraft } from '../unifiedTypes.js';
import { AppError } from '../../../../middlewares/errorHandler.js';
import { randomUUID } from 'crypto';
import OpenAI from 'openai';
import { MockQuestionExtractor } from './MockQuestionExtractor.js';

export class AIQuestionExtractor {
  private static openai: OpenAI | null = null;

  /**
   * Initialize OpenAI client
   */
  private static getOpenAI(): OpenAI {
    if (!this.openai) {
      const apiKey = process.env.OPENAI_API_KEY;
      console.log('[AIQuestionExtractor.getOpenAI] Initializing OpenAI client', {
        hasApiKey: !!apiKey,
        apiKeyPrefix: apiKey ? `${apiKey.substring(0, 7)}...` : 'none'
      });
      if (!apiKey) {
        console.log('[AIQuestionExtractor.getOpenAI] ERROR - no API key');
        throw new AppError(500, 'OPENAI_API_KEY not configured');
      }
      this.openai = new OpenAI({ apiKey });
    }
    return this.openai;
  }

  /**
   * Extract questions from segmented content using AI
   */
  static async extract(segmentedContent: SegmentedContent): Promise<ExtractedQuestionDraft[]> {
    console.log('[AIQuestionExtractor] ENTRY', { 
      totalBlocks: segmentedContent.blocks.length,
      questionBlocks: segmentedContent.blocks.filter(b => b.type === 'question').length,
      extractionMode: process.env.AI_EXTRACTION_MODE || 'ai'
    });
    
    // Check if mock mode is enabled
    const useMock = process.env.AI_EXTRACTION_MODE === 'mock';
    if (useMock) {
      console.log('[AIQuestionExtractor] Using mock extractor (AI_EXTRACTION_MODE=mock)');
      return MockQuestionExtractor.extract(segmentedContent);
    }
    
    try {
      const questionBlocks = segmentedContent.blocks.filter(block => block.type === 'question');

      if (questionBlocks.length === 0) {
        console.log('[AIQuestionExtractor] EXIT - no question blocks found');
        return [];
      }

      // Process in batches to avoid token limits
      const batchSize = 10;
      const allQuestions: ExtractedQuestionDraft[] = [];
      const totalBatches = Math.ceil(questionBlocks.length / batchSize);

      console.log('[AIQuestionExtractor] Processing in batches', { 
        totalQuestions: questionBlocks.length,
        batchSize,
        totalBatches
      });

      for (let i = 0; i < questionBlocks.length; i += batchSize) {
        const batch = questionBlocks.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        console.log('[AIQuestionExtractor] Processing batch', { 
          batchNumber,
          batchSize: batch.length,
          totalBatches
        });
        const extracted = await this.extractBatch(batch);
        console.log('[AIQuestionExtractor] Batch complete', { 
          batchNumber,
          extractedCount: extracted.length
        });
        allQuestions.push(...extracted);
      }

      console.log('[AIQuestionExtractor] EXIT - success', { 
        totalExtracted: allQuestions.length
      });
      return allQuestions;
    } catch (error) {
      console.log('[AIQuestionExtractor] EXIT - error', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Graceful degradation: fall back to mock extractor on AI failure
      console.log('[AIQuestionExtractor] AI extraction failed, falling back to mock extractor');
      try {
        const mockQuestions = await MockQuestionExtractor.extract(segmentedContent);
        console.log('[AIQuestionExtractor] Mock extractor fallback succeeded', { 
          mockQuestionCount: mockQuestions.length
        });
        // Add warning that these are mock questions
        return mockQuestions.map(q => ({
          ...q,
          warnings: [...q.warnings, 'AI extraction unavailable - using mock questions']
        }));
      } catch (mockError) {
        console.log('[AIQuestionExtractor] Mock extractor also failed', { 
          error: mockError instanceof Error ? mockError.message : 'Unknown error'
        });
        // If both fail, return empty array instead of crashing
        return [];
      }
    }
  }

  /**
   * Extract a batch of questions
   */
  private static async extractBatch(blocks: SegmentedContent['blocks']): Promise<ExtractedQuestionDraft[]> {
    console.log('[AIQuestionExtractor.extractBatch] ENTRY', { blockCount: blocks.length });
    const prompt = this.buildPrompt(blocks);
    const openai = this.getOpenAI();
    const apiKey = process.env.OPENAI_API_KEY;
    const model = 'gpt-4o-mini';

    console.log('[AIQuestionExtractor.extractBatch] OpenAI request details', {
      model,
      hasApiKey: !!apiKey,
      apiKeyPrefix: apiKey ? `${apiKey.substring(0, 7)}...` : 'none',
      promptLength: prompt.length,
      systemPromptLength: this.getSystemPrompt().length,
      totalInputLength: prompt.length + this.getSystemPrompt().length,
      temperature: 0,
      responseFormat: 'json_object',
      blockCount: blocks.length
    });

    const startTime = Date.now();
    let response;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount <= maxRetries) {
      try {
        console.log('[AIQuestionExtractor.extractBatch] Sending OpenAI request', { 
          attempt: retryCount + 1,
          maxRetries
        });
        
        response = await openai.chat.completions.create({
          model,
          messages: [
            {
              role: 'system',
              content: this.getSystemPrompt(),
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0,
          response_format: { type: 'json_object' },
        });

        const duration = Date.now() - startTime;
        console.log('[AIQuestionExtractor.extractBatch] OpenAI response received', {
          duration,
          statusCode: response.choices[0]?.finish_reason,
          usage: response.usage,
          model: response.model
        });
        break;
      } catch (error: any) {
        retryCount++;
        console.log('[AIQuestionExtractor.extractBatch] OpenAI request failed', {
          attempt: retryCount,
          errorType: error.constructor?.name,
          errorMessage: error.message,
          errorStatus: error.status,
          errorCode: error.code,
          errorHeaders: error.headers
        });

        if (retryCount > maxRetries) {
          console.log('[AIQuestionExtractor.extractBatch] Max retries exceeded');
          throw error;
        }

        // Exponential backoff
        const backoffMs = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
        console.log('[AIQuestionExtractor.extractBatch] Retrying after backoff', { backoffMs });
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }

    if (!response) {
      console.log('[AIQuestionExtractor.extractBatch] ERROR - no response after retries');
      throw new AppError(500, 'AI request failed after retries');
    }

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.log('[AIQuestionExtractor.extractBatch] ERROR - empty response');
      throw new AppError(500, 'AI returned empty response');
    }

    console.log('[AIQuestionExtractor.extractBatch] Parsing response', { 
      contentLength: content.length
    });

    const parsed = JSON.parse(content);
    const result = this.parseAIResponse(parsed, blocks);
    
    console.log('[AIQuestionExtractor.extractBatch] EXIT - success', { 
      extractedCount: result.length
    });
    
    return result;
  }

  /**
   * Build the system prompt with semantic understanding rules
   */
  private static getSystemPrompt(): string {
    return `You are an expert educational content analyzer with deep semantic understanding. Your job is to extract quiz questions exactly as a human educator would understand them.

SEMANTIC UNDERSTANDING PRINCIPLES:
- Think like an educator reading the document, not a parser parsing text
- Understand intent and meaning, not just patterns and labels
- Preserve the exact semantic structure of the content
- Never separate related content from its context
- Reason about ambiguity before making decisions

QUESTION DETECTION - THINK SEMANTICALLY:
A question is ANY content that:
- Asks for knowledge, understanding, or application
- Presents a problem to solve
- Describes a scenario requiring analysis
- Tests comprehension of preceding content
- Appears in a question context (even without explicit labels)

Recognize questions regardless of formatting:
- Explicit: "Question 1", "Q1", "1.", "Exercise 5", "Problem 3"
- Implicit: Statements followed by options, scenarios, case studies
- Contextual: Content following "Answer the following", "Solve", "Determine"
- Unlabeled: Any interrogative content in quiz context

QUESTION TYPES - COMPREHENSIVE DETECTION:
1. multiple_choice: Single correct answer from options
2. multiple_select: Multiple correct answers (checkboxes, "select all that apply")
3. true_false: Binary choice, True/False, Yes/No, Correct/Incorrect
4. fill_blank: Sentence with missing word(s), represented as _____ or [...]
5. short_answer: Brief open-ended response (1-2 sentences)
6. long_answer: Extended response, essay, detailed explanation
7. matching: Match items from two columns (A-1, B-2, etc.)
8. ordering: Arrange items in sequence (1-2-3-4, chronological)
9. case_study: Complex scenario followed by questions
10. reading_comprehension: Passage followed by questions
11. code_question: Programming problem with code
12. diagram_question: Question referencing a diagram/chart

OPTION DETECTION - SEMANTIC RECOGNITION:
Options can appear as:
- Letters: A), B), C), D), (A), (B), a., b., c.
- Numbers: 1), 2), 3), 1., 2., 3.
- Bullets: •, -, *, ○, ●
- Checkboxes: ☐, ☑, □, ✓, ✗
- Inline: (a), [b], {c}, or just text after marker
- Tables: Options in table format
- Images: Options as images

Always extract ALL options. Never skip or merge options.

ANSWER DETECTION - SEMANTIC REASONING:
Correct answers can be indicated by:
- Explicit markers: ✅, ✓, ✔, ☑, [Correct], (Answer)
- Text labels: "Correct Answer:", "Answer:", "Solution:", "Key:"
- Formatting: Bold, highlighted, green text, underlined
- Position: First option, last option, or stated in explanation
- Instructor notes: "Note: The answer is...", "Remember that..."
- Semantic reasoning: Which option makes sense given the question

If multiple answer indicators conflict, reason about which is most reliable:
- Explicit markers > formatting > position
- Direct statements > indirect hints
- Specific indicators > general patterns

CONTEXT UNDERSTANDING - RELATIONSHIPS:
Never separate related content:
- Questions below tables belong to those tables
- Questions below images belong to those images  
- Questions after paragraphs use those paragraphs as context
- Code questions use preceding code blocks
- Formula questions use preceding equations
- Case study questions use the case description

Associate context by:
- Spatial proximity (nearest related content)
- Semantic relevance (content directly referenced)
- Explicit references ("Based on the table above", "Using the code below")
- Logical flow (content in same section/topic)

FORMAT PRESERVATION - EXACT MAINTENANCE:
Preserve ALL formatting exactly:
- Bold, italic, underline, strikethrough
- Colors, highlights, background colors
- Superscript, subscript
- Fonts, font sizes
- Spacing, indentation
- Lists (nested, numbered, bulleted)
- Tables (complete structure, merged cells)
- Hyperlinks (preserve URLs and link text)
- Code blocks (language, syntax, indentation)
- Formulas (LaTeX, MathML, Unicode, Office equations)
- Images (position, captions, references)

Ignore ONLY:
- Page numbers, headers, footers
- Watermarks, decorative elements
- Blank lines (unless meaningful spacing)
- Navigation elements

CONFIDENCE SCORING - HONEST UNCERTAINTY:
For each extracted field, assign confidence (0.0-1.0):
- 0.95-1.0: Certain (explicit markers, clear structure)
- 0.85-0.94: High confidence (strong evidence, minor ambiguity)
- 0.70-0.84: Moderate confidence (reasonable inference, some ambiguity)
- 0.50-0.69: Low confidence (weak evidence, significant ambiguity)
- <0.50: Very uncertain (guessing, should flag for review)

Flag content for instructor review if:
- Any field confidence < 0.95
- Question type is ambiguous
- Answer detection is uncertain
- Context association is unclear
- Formatting preservation is incomplete

VALIDATION - QUALITY ASSURANCE:
Before finalizing extraction, verify:
- No duplicate questions (same content, different wording)
- No missing options (all options present)
- Correct answer exists and is marked
- No orphan content (images, tables, code without questions)
- Question numbering is preserved
- Formatting is maintained
- Links are valid
- Code syntax is correct
- Formula syntax is correct

OUTPUT FORMAT:
Return JSON with "questions" array. Each question must have complete information with confidence scores.

Example:
{
  "questions": [
    {
      "text": "Which planet is known as the Red Planet?",
      "type": "multiple_choice",
      "options": [
        {"text": "Earth", "isCorrect": false},
        {"text": "Mars", "isCorrect": true},
        {"text": "Jupiter", "isCorrect": false},
        {"text": "Venus", "isCorrect": false}
      ],
      "correctAnswer": "Mars",
      "explanation": "Mars is called the Red Planet due to iron oxide on its surface.",
      "difficulty": "Easy",
      "bloomLevel": "L1",
      "topic": "Astronomy",
      "subtopic": "Planets",
      "confidence": {
        "question": 0.98,
        "options": 0.95,
        "answer": 0.97,
        "type": 0.99,
        "overall": 0.97
      },
      "context": {
        "hasTable": false,
        "hasImage": false,
        "hasCode": false,
        "hasFormula": false,
        "relatedContent": []
      },
      "warnings": []
    }
  ]
}

CRITICAL: Extract exactly as an educator would understand. Preserve semantic structure. Reason about ambiguity. Flag uncertainty. Never guess when confidence is low.`;
  }

  /**
   * Build the user prompt with semantic understanding instructions
   */
  private static buildPrompt(blocks: SegmentedContent['blocks']): string {
    const content = blocks
      .map((block, index) => `--- Content Block ${index + 1} ---\n${block.text}`)
      .join('\n\n');

    return `Extract quiz questions from the following document content using semantic understanding.

${content}

SEMANTIC ANALYSIS INSTRUCTIONS:
1. Read through ALL content first to understand overall structure and context
2. Identify question boundaries by semantic intent, not just formatting
3. For each question, understand its relationship to surrounding content
4. Extract complete question blocks with all related context
5. Preserve exact formatting and structure
6. Reason about ambiguous content before making decisions

QUESTION IDENTIFICATION:
- Look for interrogative content (questions, problems, scenarios)
- Recognize implicit questions (statements followed by options)
- Identify question context (tables, images, code, passages above)
- Handle unlabeled questions (content in quiz context without explicit markers)
- Distinguish questions from section headers, instructions, or explanatory text

CONTENT ASSOCIATION:
- Link questions to nearest relevant tables, images, code blocks
- Preserve reading passages for comprehension questions
- Maintain case study descriptions with their questions
- Keep formulas/equations with their related questions
- Associate code snippets with programming questions

ANSWER DETERMINATION:
- Use all available indicators (markers, formatting, position, text)
- Reason about conflicting indicators
- Distinguish correct answers from explanations or hints
- Handle partial answers and multiple correct answers
- Flag uncertain answers for review

FORMAT PRESERVATION:
- Maintain all text formatting (bold, italic, colors, etc.)
- Preserve list structures (nested, numbered, bulleted)
- Keep table structures intact (merged cells, headers)
- Maintain code formatting (indentation, syntax highlighting)
- Preserve formula notation (LaTeX, MathML, Unicode)
- Keep hyperlinks with URLs and link text

CONFIDENCE ASSESSMENT:
- Assign confidence scores for each extracted field
- Be honest about uncertainty
- Flag content with confidence < 0.95 for instructor review
- Explain reasoning for low-confidence decisions

Return as JSON with "questions" array containing complete semantic understanding with confidence scores.`;
  }

  /**
   * Parse AI response into ExtractedQuestionDraft objects
   * Enhanced to handle confidence scores and context information
   */
  private static parseAIResponse(
    response: { questions: unknown[] },
    originalBlocks: SegmentedContent['blocks']
  ): ExtractedQuestionDraft[] {
    if (!Array.isArray(response.questions)) {
      throw new AppError(500, 'AI returned invalid response format');
    }

    return response.questions.map((q: unknown, index) => {
      if (!this.isValidQuestionObject(q)) {
        throw new AppError(500, `AI returned invalid question at_index ${index}`);
      }

      const qObj = q as any;
      
      // Extract AI-provided confidence if available, otherwise calculate it
      const aiConfidence = qObj.confidence;
      const calculatedConfidence = this.calculateConfidence(q);
      const finalConfidence = aiConfidence && typeof aiConfidence === 'object' 
        ? { ...calculatedConfidence, ...aiConfidence }
        : calculatedConfidence;

      // Extract context information if provided by AI
      const context = qObj.context || {
        hasTable: false,
        hasImage: false,
        hasCode: false,
        hasFormula: false,
        relatedContent: []
      };

      // Generate warnings with enhanced validation
      const warnings = this.generateWarnings({
        ...q,
        confidence: finalConfidence
      });

      // Add low-confidence warnings
      if (finalConfidence.overall < 0.95) {
        warnings.push(`Overall extraction confidence below 95% (${finalConfidence.overall}) - instructor review required`);
      }

      return {
        id: randomUUID(),
        text: String(q.text),
        type: this.normalizeQuestionType(q.type),
        options: Array.isArray(q.options) ? q.options.map((opt, i) => this.normalizeOption(opt, i)) : [],
        correctAnswer: q.correctAnswer ? String(q.correctAnswer) : '',
        explanation: q.explanation ? String(q.explanation) : undefined,
        difficulty: this.normalizeDifficulty(q.difficulty),
        bloomLevel: this.normalizeBloomLevel(q.bloomLevel),
        topic: q.topic ? String(q.topic) : undefined,
        subtopic: q.subtopic ? String(q.subtopic) : undefined,
        tags: Array.isArray(q.tags) ? q.tags.map(String) : [],
        confidence: finalConfidence.overall,
        warnings,
        metadata: {
          originalBlockId: originalBlocks[index]?.id || randomUUID(),
          context,
          confidenceBreakdown: finalConfidence,
          ...(typeof q.metadata === 'object' && q.metadata !== null ? q.metadata : {}),
        },
      };
    });
  }

  /**
   * Validate question object structure
   */
  private static isValidQuestionObject(q: unknown): q is {
    text: unknown;
    type: unknown;
    options?: unknown;
    correctAnswer?: unknown;
    explanation?: unknown;
    metadata?: unknown;
  } {
    return (
      typeof q === 'object' &&
      q !== null &&
      'text' in q &&
      'type' in q
    );
  }

  /**
   * Normalize question type to GateHub format
   */
  private static normalizeQuestionType(type: unknown): ExtractedQuestionDraft['type'] {
    const typeStr = String(type).toLowerCase();
    const typeMap: Record<string, ExtractedQuestionDraft['type']> = {
      'multiple choice': 'multiple_choice',
      'multiple-choice': 'multiple_choice',
      'mcq': 'multiple_choice',
      'mc': 'multiple_choice',
      'multiple select': 'multiple_select',
      'multiple-select': 'multiple_select',
      'checkbox': 'multiple_select',
      'true/false': 'true_false',
      'true false': 'true_false',
      'tf': 'true_false',
      'short answer': 'short_answer',
      'short-answer': 'short_answer',
      'text': 'short_answer',
      'essay': 'short_answer',
    };

    return typeMap[typeStr] || 'multiple_choice';
  }

  /**
   * Normalize option structure
   */
  private static normalizeOption(opt: unknown, index: number): { id: string; text: string; isCorrect: boolean; order: number } {
    if (typeof opt === 'string') {
      return { id: randomUUID(), text: opt, isCorrect: false, order: index };
    }
    if (typeof opt === 'object' && opt !== null) {
      const optObj = opt as Record<string, unknown>;
      return {
        id: randomUUID(),
        text: String(optObj.text || opt),
        isCorrect: Boolean(optObj.isCorrect || optObj.correct),
        order: Number(optObj.order) ?? index,
      };
    }
    return { id: randomUUID(), text: String(opt), isCorrect: false, order: index };
  }

  /**
   * Normalize difficulty to standard format
   */
  private static normalizeDifficulty(difficulty: unknown): ExtractedQuestionDraft['difficulty'] {
    if (!difficulty || typeof difficulty !== 'string') {
      return 'medium';
    }
    
    const diffStr = difficulty.toLowerCase().trim();
    const diffMap: Record<string, ExtractedQuestionDraft['difficulty']> = {
      'easy': 'easy',
      'simple': 'easy',
      'basic': 'easy',
      'beginner': 'easy',
      'medium': 'medium',
      'intermediate': 'medium',
      'moderate': 'medium',
      'hard': 'hard',
      'difficult': 'hard',
      'advanced': 'hard',
      'complex': 'hard',
      'challenging': 'hard',
    };
    
    return diffMap[diffStr] || 'medium';
  }

  /**
   * Normalize Bloom's level to standard format
   */
  private static normalizeBloomLevel(bloomLevel: unknown): ExtractedQuestionDraft['bloomLevel'] {
    if (!bloomLevel || typeof bloomLevel !== 'string') {
      return 'L2';
    }
    
    const bloomStr = bloomLevel.toUpperCase().trim();
    const validLevels = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'];
    
    if (validLevels.includes(bloomStr)) {
      return bloomStr as ExtractedQuestionDraft['bloomLevel'];
    }
    
    // Map common Bloom's taxonomy terms
    const bloomMap: Record<string, ExtractedQuestionDraft['bloomLevel']> = {
      'remember': 'L1',
      'knowledge': 'L1',
      'understand': 'L2',
      'comprehension': 'L2',
      'apply': 'L3',
      'application': 'L3',
      'analyze': 'L4',
      'analysis': 'L4',
      'evaluate': 'L5',
      'evaluation': 'L5',
      'create': 'L6',
      'synthesis': 'L6',
    };
    
    return bloomMap[bloomStr.toLowerCase()] || 'L2';
  }

  /**
   * Calculate detailed confidence scores based on extraction quality
   * Implements per-field confidence tracking as specified in system prompt
   */
  private static calculateConfidence(q: {
    text: unknown;
    options?: unknown;
    correctAnswer?: unknown;
    type?: unknown;
    explanation?: unknown;
  }): {
    question: number;
    options: number;
    answer: number;
    type: number;
    overall: number;
  } {
    let questionConf = 0.5;
    let optionsConf = 0.5;
    let answerConf = 0.5;
    let typeConf = 0.5;

    // Question text confidence
    if (q.text && String(q.text).length > 20) {
      questionConf += 0.3; // Good length
    }
    if (q.text && String(q.text).length > 50) {
      questionConf += 0.1; // Very good length
    }
    if (q.text && /\?|Which|What|How|Why|When|Where|Who|Explain|Describe|Discuss/i.test(String(q.text))) {
      questionConf += 0.2; // Clear question format
    }
    questionConf = Math.min(questionConf, 1.0);

    // Options confidence
    if (Array.isArray(q.options)) {
      if (q.options.length >= 4) {
        optionsConf += 0.3; // Good option count
      }
      if (q.options.length >= 2) {
        optionsConf += 0.1; // Minimum options
      }
      const validOptions = q.options.filter((opt: any) => 
        opt && typeof opt.text === 'string' && opt.text.length > 0
      );
      if (validOptions.length === q.options.length) {
        optionsConf += 0.2; // All options valid
      }
      // Check for clear option markers
      const hasMarkers = q.options.some((opt: any) => 
        opt && /^[A-D]\)|^\(A-D\)|^[1-4]\)|^•|^-/i.test(String(opt.text))
      );
      if (hasMarkers) {
        optionsConf += 0.2; // Clear formatting
      }
    }
    optionsConf = Math.min(optionsConf, 1.0);

    // Answer confidence
    if (q.correctAnswer && String(q.correctAnswer).length > 0) {
      answerConf += 0.3; // Has answer
    }
    if (q.correctAnswer && String(q.correctAnswer).length > 2) {
      answerConf += 0.2; // Substantial answer
    }
    // Check if answer matches one of the options
    if (Array.isArray(q.options) && q.correctAnswer) {
      const answerMatches = q.options.some((opt: any) => 
        opt && String(opt.text).toLowerCase().includes(String(q.correctAnswer).toLowerCase())
      );
      if (answerMatches) {
        answerConf += 0.3; // Answer matches option
      }
    }
    // Check for explicit answer markers in options
    if (Array.isArray(q.options)) {
      const hasExplicitMarker = q.options.some((opt: any) => 
        opt && (opt.isCorrect === true || 
               (typeof opt.text === 'string' && 
                (opt.text.includes('✓') || opt.text.includes('✔') || 
                 opt.text.includes('✅') || opt.text.includes('☑'))))
      );
      if (hasExplicitMarker) {
        answerConf += 0.2; // Explicit correct marker
      }
    }
    answerConf = Math.min(answerConf, 1.0);

    // Type confidence
    if (q.type && typeof q.type === 'string') {
      const validTypes = ['multiple_choice', 'multiple_select', 'true_false', 'short_answer', 'long_answer', 
                         'fill_blank', 'matching', 'ordering', 'case_study', 'reading_comprehension'];
      if (validTypes.includes(q.type)) {
        typeConf += 0.4; // Valid type
      }
      // Type matches content structure
      if (q.type === 'multiple_choice' && Array.isArray(q.options) && q.options.length >= 2) {
        typeConf += 0.3; // MCQ with options
      }
      if (q.type === 'true_false' && Array.isArray(q.options) && q.options.length === 2) {
        typeConf += 0.3; // TF with 2 options
      }
      if ((q.type === 'short_answer' || q.type === 'long_answer') && !Array.isArray(q.options)) {
        typeConf += 0.3; // Open-ended without options
      }
    }
    typeConf = Math.min(typeConf, 1.0);

    // Calculate overall confidence (weighted average)
    const overall = (questionConf * 0.3) + (optionsConf * 0.25) + (answerConf * 0.3) + (typeConf * 0.15);

    return {
      question: Math.round(questionConf * 100) / 100,
      options: Math.round(optionsConf * 100) / 100,
      answer: Math.round(answerConf * 100) / 100,
      type: Math.round(typeConf * 100) / 100,
      overall: Math.round(overall * 100) / 100
    };
  }

  /**
   * Generate comprehensive warnings for potential issues
   * Enhanced validation with semantic understanding
   */
  private static generateWarnings(q: {
    text: unknown;
    options?: unknown;
    correctAnswer?: unknown;
    type?: unknown;
    explanation?: unknown;
    confidence?: any;
  }): string[] {
    const warnings: string[] = [];

    // Question text validation
    if (!q.text || String(q.text).length < 5) {
      warnings.push('Question text is very short or missing');
    }
    if (q.text && String(q.text).length > 500) {
      warnings.push('Question text is unusually long - may include unrelated content');
    }
    if (q.text && !/\?|Which|What|How|Why|When|Where|Who|Explain|Describe|Discuss|Choose|Select|Determine|Calculate|Find|Identify/i.test(String(q.text))) {
      warnings.push('Question text may not be a question - verify semantic intent');
    }

    // Options validation
    if (!Array.isArray(q.options) || q.options.length === 0) {
      if (q.type === 'multiple_choice' || q.type === 'multiple_select' || q.type === 'true_false') {
        warnings.push('MCQ/TF question has no options - type may be incorrect');
      }
    } else {
      if (q.options.length < 2 && (q.type === 'multiple_choice' || q.type === 'multiple_select')) {
        warnings.push('MCQ has fewer than 2 options - verify completeness');
      }
      if (q.options.length < 4 && q.type === 'multiple_choice') {
        warnings.push('MCQ has fewer than 4 options - may be incomplete');
      }
      if (q.options.length > 10) {
        warnings.push('Unusually high number of options - verify these are not sub-questions');
      }
      
      // Check for duplicate options
      const optionTexts = q.options.map((opt: any) => String(opt.text || '').toLowerCase().trim());
      const duplicates = optionTexts.filter((text, i) => optionTexts.indexOf(text) !== i);
      if (duplicates.length > 0) {
        warnings.push('Duplicate options detected - review and merge');
      }

      // Check for option consistency
      const hasMarkers = q.options.some((opt: any) => /^[A-D]\)|^\(A-D\)|^[1-4]\)/i.test(String(opt.text)));
      const allHaveMarkers = q.options.every((opt: any) => /^[A-D]\)|^\(A-D\)|^[1-4]\)/i.test(String(opt.text)));
      if (hasMarkers && !allHaveMarkers) {
        warnings.push('Inconsistent option formatting - some have markers, some don\'t');
      }
    }

    // Answer validation
    if (!q.correctAnswer || String(q.correctAnswer).trim().length === 0) {
      warnings.push('No correct answer identified - requires instructor review');
    } else {
      // Check if answer matches an option for MCQ types
      if (Array.isArray(q.options) && (q.type === 'multiple_choice' || q.type === 'true_false')) {
        const answerMatches = q.options.some((opt: any) => 
          opt && String(opt.text).toLowerCase().includes(String(q.correctAnswer).toLowerCase())
        );
        if (!answerMatches) {
          warnings.push('Correct answer does not match any option - verify accuracy');
        }
      }
      // Check for multiple correct answers in single-select type
      if (q.type === 'multiple_choice' && Array.isArray(q.options)) {
        const correctCount = q.options.filter((opt: any) => opt.isCorrect === true).length;
        if (correctCount > 1) {
          warnings.push('Multiple correct answers marked for single-select type - verify question type');
        }
        if (correctCount === 0 && q.correctAnswer) {
          warnings.push('No option marked as correct despite answer being provided');
        }
      }
    }

    // Type validation
    if (!q.type || typeof q.type !== 'string') {
      warnings.push('Question type missing or invalid');
    } else {
      const validTypes = ['multiple_choice', 'multiple_select', 'true_false', 'short_answer', 'long_answer', 
                         'fill_blank', 'matching', 'ordering', 'case_study', 'reading_comprehension'];
      if (!validTypes.includes(q.type)) {
        warnings.push(`Unrecognized question type: ${q.type}`);
      }
    }

    // Confidence-based warnings
    if (q.confidence && typeof q.confidence === 'object') {
      const conf = q.confidence as any;
      if (conf.overall < 0.95) {
        warnings.push(`Low overall confidence (${conf.overall}) - instructor review recommended`);
      }
      if (conf.question < 0.95) {
        warnings.push(`Low question confidence (${conf.question}) - verify question text`);
      }
      if (conf.options < 0.95) {
        warnings.push(`Low options confidence (${conf.options}) - verify options completeness`);
      }
      if (conf.answer < 0.95) {
        warnings.push(`Low answer confidence (${conf.answer}) - verify correct answer`);
      }
      if (conf.type < 0.95) {
        warnings.push(`Low type confidence (${conf.type}) - verify question type`);
      }
    }

    // Content completeness warnings
    if (!q.explanation && (q.type === 'multiple_choice' || q.type === 'true_false')) {
      // Missing explanation is common, so just a low-priority warning
      warnings.push('No explanation provided - consider adding for better learning');
    }

    return warnings;
  }
}
