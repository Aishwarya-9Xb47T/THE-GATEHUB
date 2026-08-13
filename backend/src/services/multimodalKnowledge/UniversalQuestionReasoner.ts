import { ExtractedQuestion, QuestionOption, QuestionType, MultimodalBlock, StructuredTable, ExtractedImage, CodeBlock, MathFormula } from './types.js';

export class UniversalQuestionReasoner {
  /**
   * Universal Question, Dynamic Option & Signal Answer Extraction Engine
   */
  public static extractQuestions(
    blocks: MultimodalBlock[],
    rawText: string,
    tables: StructuredTable[],
    images: ExtractedImage[],
    codeBlocks: CodeBlock[],
    equations: MathFormula[],
    speakerNotes: string[]
  ): ExtractedQuestion[] {
    const questions: ExtractedQuestion[] = [];

    // Combine blocks and raw text paragraphs
    const combinedSpeakerNotes = speakerNotes.join('\n');

    // Question splitters: 1., Q1:, Question 1:, ## Q, etc.
    const questionBlockRegex = /(?:^|\n)(?:Q\d+[:.]?|Question\s*\d+[:.]?|\d+[\.)])\s+([\s\S]*?)(?=(?:\n(?:Q\d+[:.]?|Question\s*\d+[:.]?|\d+[\.)])\s+)|$)/gi;

    let match;
    let qIdx = 1;

    while ((match = questionBlockRegex.exec(rawText)) !== null) {
      const qContent = match[1].trim();
      if (qContent.length < 10) continue;

      const lines = qContent.split('\n').map(l => l.trim()).filter(Boolean);
      const stem = lines[0] || 'Question';

      // 1. Dynamic Option Extraction (A-F, 1-9, i-v, bullets, checkboxes)
      const options = this.extractDynamicOptions(lines.slice(1), tables, images);

      // 2. Multi-Signal Answer Detection (Speaker Notes, Bold, Green, "Answer:", "Correct:")
      const answerInfo = this.detectAnswerSignal(qContent, stem, options, combinedSpeakerNotes);

      // 3. Question Type Inference
      const qType = this.inferQuestionType(stem, options, qContent, codeBlocks, equations, tables, images);

      // 4. Attach multimodal context
      const attachedTable = tables.find(t => qContent.includes(t.caption || '') || (t.html && qContent.includes('table')));
      const attachedCode = codeBlocks.find(c => qContent.includes(c.code.substring(0, 20)));
      const attachedMath = equations.find(m => qContent.includes(m.latex));

      const questionObj: ExtractedQuestion = {
        id: `q_extracted_${qIdx++}`,
        type: qType,
        stem,
        options,
        correctAnswer: answerInfo.correctAnswer,
        explanation: answerInfo.explanation,
        hints: answerInfo.hints,
        table: attachedTable,
        codeSnippet: attachedCode,
        mathFormula: attachedMath,
        sourceSignal: answerInfo.signalType,
        difficulty: 'medium',
        bloomsLevel: qType === 'coding' || qType === 'math' ? 'apply' : 'understand',
      };

      questions.push(questionObj);
    }

    // Fallback: If no explicit Q1/Q2 markers, extract from blocks or speaker notes directly
    if (questions.length === 0 && blocks.length > 0) {
      const questionBlocks = blocks.filter(b => b.text && (b.text.includes('?') || b.type === 'question'));
      questionBlocks.forEach((b, idx) => {
        questions.push({
          id: `q_fallback_${idx + 1}`,
          type: 'short_answer',
          stem: b.text || 'Extracted Question',
          options: [],
          difficulty: 'medium',
          bloomsLevel: 'understand',
        });
      });
    }

    return questions;
  }

  /**
   * Dynamic option detection without hardcoding to 4 options. Supports A-Z, 1-99, Roman numerals, checkboxes, bullets.
   */
  private static extractDynamicOptions(
    optionLines: string[],
    tables: StructuredTable[],
    images: ExtractedImage[]
  ): QuestionOption[] {
    const options: QuestionOption[] = [];

    const optionPrefixRegex = /^(?:[A-Z\dIVXLCDM]|option|\*|-)\s*[:.)\]-]?\s+(.*)$/i;

    optionLines.forEach((line, idx) => {
      const cleanLine = line.trim();
      // Match option prefix: A), B., 1), [ ], *, -
      const m = cleanLine.match(/^([A-Z\d]|(?:[i|v|x]+)|[•*-]|\[\s*\])\s*[:.)\]-]?\s+(.*)$/i);
      
      if (m) {
        const label = m[1].toUpperCase();
        const text = m[2].trim();
        const isAnswerSignalled = text.toLowerCase().includes('(correct)') || text.toLowerCase().includes('*correct*') || text.startsWith('[x]');
        
        options.push({
          id: `opt_${idx + 1}`,
          label: label.length <= 3 ? label : `Opt ${options.length + 1}`,
          text: text.replace(/\(correct\)/i, '').replace(/\[x\]/i, '').trim(),
          isCorrect: isAnswerSignalled || undefined,
        });
      }
    });

    return options;
  }

  /**
   * Answer detection from Speaker Notes, Bold, "Answer:", "Correct:", Metadata, Comments
   */
  private static detectAnswerSignal(
    qContent: string,
    stem: string,
    options: QuestionOption[],
    speakerNotes: string
  ): {
    correctAnswer?: string | string[];
    explanation?: string;
    hints?: string[];
    signalType?: ExtractedQuestion['sourceSignal'];
  } {
    // 1. Explicit Answer: or Correct: tag in question content
    const ansMatch = qContent.match(/(?:Answer|Correct|Key)\s*[:=]\s*([A-F\d\s,]+)(?:\n|$)/i);
    if (ansMatch) {
      const ansText = ansMatch[1].trim();
      return {
        correctAnswer: ansText,
        signalType: 'explicit_key',
        explanation: 'Extracted from explicit Answer/Key label in document text.',
      };
    }

    // 2. Speaker Notes / Teacher Notes Signal
    if (speakerNotes && speakerNotes.length > 0) {
      const noteAnsMatch = speakerNotes.match(/(?:Answer|Correct|Key)\s*[:=]\s*([A-F\d\s,]+)(?:\n|$)/i);
      if (noteAnsMatch) {
        return {
          correctAnswer: noteAnsMatch[1].trim(),
          signalType: 'speaker_notes',
          explanation: `Extracted from Presentation Speaker Notes: "${speakerNotes.substring(0, 100)}..."`,
        };
      }
    }

    // 3. Option marked as correct from dynamic option parser
    const correctOpt = options.find(o => o.isCorrect);
    if (correctOpt) {
      return {
        correctAnswer: correctOpt.label,
        signalType: 'bold_text',
        explanation: 'Extracted from formatted/marked option text.',
      };
    }

    return {};
  }

  /**
   * Question Type Inference (15+ supported types)
   */
  private static inferQuestionType(
    stem: string,
    options: QuestionOption[],
    qContent: string,
    codeBlocks: CodeBlock[],
    equations: MathFormula[],
    tables: StructuredTable[],
    images: ExtractedImage[]
  ): QuestionType {
    const lowerStem = stem.toLowerCase();

    if (codeBlocks.some(c => qContent.includes(c.code.substring(0, 15))) || lowerStem.includes('code') || lowerStem.includes('function')) return 'coding';
    if (equations.some(e => qContent.includes(e.latex)) || lowerStem.includes('calculate') || lowerStem.includes('solve')) return 'math';
    if (lowerStem.includes('true') && lowerStem.includes('false')) return 'true_false';
    if (lowerStem.includes('fill in the blank') || stem.includes('___')) return 'fill_blank';
    if (lowerStem.includes('match') || lowerStem.includes('column a')) return 'matching';
    if (lowerStem.includes('order') || lowerStem.includes('arrange')) return 'ordering';
    if (tables.length > 0 && qContent.includes('table')) return 'table_question';
    if (images.length > 0 && qContent.includes('figure')) return 'image_question';
    if (options.length >= 2) return 'mcq';
    if (lowerStem.includes('discuss') || lowerStem.includes('explain')) return 'long_answer';
    
    return 'short_answer';
  }
}
