import { ExtractedQuestion, ExtractedOption, CodeBlockNode, TableNode, MathNode, ExtractedMedia } from '../types.js';
import { CodeBlockExtractor } from './CodeBlockExtractor.js';
import { MathFormulaEngine } from './MathFormulaEngine.js';

export class UniversalQuestionEngine {
  /**
   * Parse document text/AST into structured ExtractedQuestion objects
   */
  public static extractQuestions(
    rawText: string,
    optionsHint?: { mediaList?: ExtractedMedia[]; codeBlocks?: CodeBlockNode[]; tables?: TableNode[] }
  ): ExtractedQuestion[] {
    const questions: ExtractedQuestion[] = [];
    const mediaList = optionsHint?.mediaList || [];
    const codeBlocks = optionsHint?.codeBlocks || [];
    const tables = optionsHint?.tables || [];

    // Split text into question blocks based on common numbering patterns: (1., Q1., 1), Question 1:, etc.)
    const questionBlockRegex = /(?:^|\n)(?:Q(?:uestion)?\s*\d+[\.\:\)]|\d+[\.\:\)])\s+/gi;
    const matches = Array.from(rawText.matchAll(questionBlockRegex));

    if (matches.length === 0) {
      // Fallback: analyze raw text directly as a potential single question or structural question
      const singleQ = this.parseSingleQuestionBlock(rawText, 1, mediaList, codeBlocks, tables);
      if (singleQ) questions.push(singleQ);
      return questions;
    }

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const startIndex = match.index!;
      const endIndex = i + 1 < matches.length ? matches[i + 1].index! : rawText.length;
      const blockText = rawText.substring(startIndex, endIndex).trim();

      const parsedQ = this.parseSingleQuestionBlock(blockText, i + 1, mediaList, codeBlocks, tables);
      if (parsedQ) {
        questions.push(parsedQ);
      }
    }

    return questions;
  }

  /**
   * Parse an individual question block text
   */
  private static parseSingleQuestionBlock(
    blockText: string,
    index: number,
    mediaList: ExtractedMedia[],
    codeBlocks: CodeBlockNode[],
    tables: TableNode[]
  ): ExtractedQuestion | null {
    if (!blockText || blockText.length < 5) return null;

    // 1. Extract Stems and Options
    const lines = blockText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const stemLines: string[] = [];
    const rawOptions: { text: string; prefix: string; isCorrect: boolean }[] = [];

    // Option prefix matchers: A., B., C., D., E., F., 1), 2), 3), a), b), c), [x], (A)
    const optionRegex = /^(?:[\(\[]?([A-Za-z0-9]+)[\.\)\:]|[*•\-])\s+(.*)$/;
    const answerKeyRegex = /^(?:Answer|Ans|Correct Answer|Solution)[\:\s]+([A-Z0-9,\s]+|\btrue\b|\bfalse\b)/i;

    let explanation = '';
    let isCorrectMarked = false;

    for (const line of lines) {
      const ansMatch = line.match(answerKeyRegex);
      if (ansMatch) {
        explanation = line;
        const keysStr = ansMatch[1].trim().toUpperCase();
        const targetKeys = keysStr.split(/[\s,]+/).filter(Boolean);
        rawOptions.forEach(opt => {
          const optPrefixUpper = opt.prefix.toUpperCase();
          const optTextUpper = opt.text.toUpperCase();
          if (targetKeys.includes(optPrefixUpper) || targetKeys.some(k => k && optTextUpper.includes(k))) {
            opt.isCorrect = true;
            isCorrectMarked = true;
          }
        });
        continue;
      }

      const optMatch = line.match(optionRegex);
      // Check if line looks like an option (and isn't the main Question prefix if it's the first line)
      if (optMatch && (stemLines.length > 0 || rawOptions.length > 0)) {
        const prefix = optMatch[1] || '';
        const optText = optMatch[2] || '';

        // Check if option text has correct answer indicator like (*), (correct), ✔, ✓
        const isAnswerIndicator = /[\*✔✓]|\(correct\)/i.test(optText) || /[\*✔✓]|\(correct\)/i.test(line);
        const cleanedText = optText.replace(/[\*✔✓]|\(correct\)/gi, '').trim();

        rawOptions.push({
          prefix,
          text: cleanedText,
          isCorrect: isAnswerIndicator,
        });
        if (isAnswerIndicator) isCorrectMarked = true;
      } else {
        stemLines.push(line);
      }
    }

    // Default correct option to first option if none explicitly marked for MCQs
    if (!isCorrectMarked && rawOptions.length > 0) {
      rawOptions[0].isCorrect = true;
    }

    const stemText = stemLines.join('\n').replace(/^(?:Q(?:uestion)?\s*\d+[\.\:\)]|\d+[\.\:\)])\s*/i, '').trim();

    // 2. Attach Code Blocks, Math Formulas, Tables, Media
    const extractedCode = CodeBlockExtractor.extractCodeBlocks(blockText);
    const codeBlock = extractedCode.codeBlocks[0] || codeBlocks[0] || undefined;

    const mathNodes = MathFormulaEngine.extractMathFormulas(blockText);
    const mathNode = mathNodes[0] || undefined;

    const table = tables.length > 0 ? tables[0] : undefined;
    const attachedMedia = mediaList.length > 0 ? mediaList.slice(0, 2) : undefined;

    // 3. Classify Question Type dynamically (Supports N options, True/False, Coding, Math, Essay, Match, Fill Blank, etc.)
    let qType: ExtractedQuestion['type'] = 'multiple_choice';

    const lowerStem = stemText.toLowerCase();

    if (codeBlock || /def\s+\w+|public\s+class|#include|function\b|write a program|code/i.test(lowerStem)) {
      qType = 'coding_question';
    } else if (rawOptions.length === 2 && (rawOptions[0].text.toLowerCase() === 'true' || rawOptions[0].text.toLowerCase() === 'false')) {
      qType = 'true_false';
    } else if (rawOptions.filter(o => o.isCorrect).length > 1) {
      qType = 'multiple_select';
    } else if (/match the following|column a|column b/i.test(lowerStem)) {
      qType = 'match_following';
    } else if (/fill in the blank|_____|blank/i.test(lowerStem)) {
      qType = 'fill_blank';
    } else if (/assertion|reason/i.test(lowerStem)) {
      qType = 'assertion_reason';
    } else if (/case study|read the following passage/i.test(lowerStem)) {
      qType = 'case_study';
    } else if (mathNode || /calculate|solve|equation|formula|matrix|integral/i.test(lowerStem)) {
      qType = 'math_question';
    } else if (table || /table|columns|rows/i.test(lowerStem)) {
      qType = 'table_based';
    } else if (attachedMedia || /figure|diagram|image|graph/i.test(lowerStem)) {
      qType = 'image_based';
    } else if (rawOptions.length === 0) {
      qType = lowerStem.includes('explain') || lowerStem.includes('describe') ? 'essay' : 'short_answer';
    }

    const options: ExtractedOption[] = rawOptions.map((opt, idx) => ({
      id: `opt_${index}_${idx + 1}`,
      text: opt.text,
      isCorrect: opt.isCorrect,
      order: idx + 1,
    }));

    return {
      id: `q_${index}`,
      rawText: blockText,
      stem: stemText || blockText,
      type: qType,
      marks: 1,
      negativeMarks: 0,
      difficulty: 'medium',
      bloomLevel: 'L2',
      options,
      codeBlock,
      table,
      mathNode,
      media: attachedMedia,
      explanation: explanation || undefined,
      confidence: 0.95,
    };
  }
}
