import { SemanticDocumentTree, SemanticBlock } from '../pass1/SemanticDocumentTree.js';
import { ExtractedQuestion, ExtractedOption, ExtractedMedia, CodeBlockNode, TableNode, MathNode } from '../types.js';

export class EducationalGroupingEngine {
  /**
   * PASS 2: Educational Grouping Engine
   * Converts ordered SemanticBlocks from Pass 1 into Unified ExtractedQuestion Root Containers.
   * Rule: Question X starts at QuestionMarker / Stem and ENDS ONLY when Question X+1 starts.
   */
  public static groupQuestions(tree: SemanticDocumentTree): ExtractedQuestion[] {
    const questions: ExtractedQuestion[] = [];
    const blocks = tree.blocks;

    let currentQBlocks: SemanticBlock[] = [];
    let questionCounter = 1;

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const isQStart = this.isQuestionStart(block, i > 0 ? blocks[i - 1] : null);

      if (isQStart && currentQBlocks.length > 0) {
        // Build question object for accumulated blocks
        const qObj = this.buildQuestionFromBlocks(currentQBlocks, questionCounter++);
        if (qObj) questions.push(qObj);
        currentQBlocks = [block];
      } else {
        currentQBlocks.push(block);
      }
    }

    if (currentQBlocks.length > 0) {
      const qObj = this.buildQuestionFromBlocks(currentQBlocks, questionCounter++);
      if (qObj) questions.push(qObj);
    }

    return questions;
  }

  /**
   * Determine if a block represents the start of a new Question
   */
  private static isQuestionStart(block: SemanticBlock, prevBlock: SemanticBlock | null): boolean {
    if (block.type === 'QuestionMarker') return true;

    // Check pattern: "Question 1:", "Q8.", "Q.1" at start of paragraph/heading
    const text = block.plainText.trim();
    if (block.type === 'Paragraph' || block.type === 'Heading') {
      if (/^(?:Q(?:uestion)?\s*\d+[\.\:\)]|Q\.\s*\d+|Problem\s*\d+[\.\:\)]?|\d+[\.\)]\s+)/i.test(text)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Assemble a list of semantic blocks into a single ExtractedQuestion root container
   */
  private static buildQuestionFromBlocks(blocks: SemanticBlock[], index: number): ExtractedQuestion | null {
    if (blocks.length === 0) return null;

    const hasQMarker = blocks.some(b => b.type === 'QuestionMarker');
    const hasOptions = blocks.some(b => b.type === 'Option');
    const hasMediaOrCode = blocks.some(b => b.media || b.code || b.table || b.math);

    if (!hasQMarker && !hasOptions && !hasMediaOrCode) {
      return null;
    }

    const stemParts: string[] = [];
    const options: ExtractedOption[] = [];
    const mediaList: ExtractedMedia[] = [];
    const hyperlinksList: Array<{ text: string; url: string }> = [];
    const listsList: Array<{ style: 'ordered' | 'unordered'; items: string[] }> = [];

    let codeBlock: CodeBlockNode | undefined;
    let table: TableNode | undefined;
    let mathNode: MathNode | undefined;
    let explanation: string | undefined;
    let hint: string | undefined;
    let questionType: ExtractedQuestion['type'] = 'multiple_choice';

    let optionCounter = 1;

    for (const b of blocks) {
      // Collect Images
      if (b.media) {
        mediaList.push(b.media);
      }

      // Collect Code Block
      if (b.code) {
        codeBlock = b.code;
        questionType = 'coding_question';
      }

      // Collect Table
      if (b.table) {
        table = b.table;
        if (questionType === 'multiple_choice') questionType = 'table_based';
      }

      // Collect Math Equation
      if (b.math) {
        mathNode = b.math;
        if (questionType === 'multiple_choice') questionType = 'math_question';
      }

      // Collect Hyperlinks
      if (b.hyperlink) {
        hyperlinksList.push(b.hyperlink);
      }

      // Collect Lists
      if (b.listData) {
        listsList.push({ style: b.listData.style === 'ordered' ? 'ordered' : 'unordered', items: b.listData.items });
      }

      // Collect Options
      if (b.type === 'Option') {
        options.push({
          id: `opt_${index}_${optionCounter++}`,
          text: b.plainText,
          isCorrect: b.isCorrectOption || false,
          order: optionCounter - 1,
          media: b.media,
        });
      } else if (b.type === 'Answer') {
        const keyText = b.plainText.replace(/^(?:Answer|Ans|Correct Answer)[\:\s]+/i, '').trim();
        const targetKeys = keyText.split(/[\s,]+/).map(k => k.toUpperCase());
        options.forEach(opt => {
          if (targetKeys.includes(opt.id) || targetKeys.some(k => k && opt.text.toUpperCase().includes(k))) {
            opt.isCorrect = true;
          }
        });
      } else if (b.type === 'Explanation') {
        explanation = b.plainText;
      } else if (b.type === 'Hint') {
        hint = b.plainText;
      } else {
        // Stem paragraphs, headings, captions
        if (b.plainText.trim() && !['PageBreak', 'Header', 'Footer'].includes(b.type)) {
          const cleanedText = b.plainText.replace(/^(?:Q(?:uestion)?\s*\d+[\.\:\)]|\d+[\.\:\)])\s*/i, '').trim();
          if (cleanedText) stemParts.push(cleanedText);
        }
      }
    }

    // Default correct option if none marked for MCQ
    if (options.length > 0 && !options.some(o => o.isCorrect)) {
      options[0].isCorrect = true;
    }

    // Question Type refinements
    if (options.length === 2 && options.some(o => o.text.toLowerCase() === 'true')) {
      questionType = 'true_false';
    } else if (options.filter(o => o.isCorrect).length > 1) {
      questionType = 'multiple_select';
    } else if (listsList.length > 0) {
      questionType = listsList.some(l => l.style === 'ordered') ? 'ordering' : 'multiple_choice';
    } else if (codeBlock) {
      questionType = 'coding';
    } else if (table) {
      questionType = 'table_based';
    } else if (mathNode) {
      questionType = 'equation_question';
    } else if (mediaList.length > 0 && questionType === 'multiple_choice') {
      questionType = 'image_based';
    } else if (options.length === 0) {
      questionType = stemParts.join(' ').toLowerCase().includes('explain') ? 'essay' : 'short_answer';
    }

    const stem = stemParts.join('\n').trim() || `Question ${index}`;

    return {
      id: `q_${index}`,
      rawText: blocks.map(b => b.plainText).join('\n'),
      stem,
      type: questionType,
      marks: 1,
      negativeMarks: 0,
      difficulty: 'medium',
      bloomLevel: 'L2',
      options,
      codeBlock,
      table,
      mathNode,
      media: mediaList.length > 0 ? mediaList : undefined,
      hyperlinks: hyperlinksList.length > 0 ? hyperlinksList : undefined,
      lists: listsList.length > 0 ? listsList : undefined,
      explanation,
      hint,
      confidence: 0.98,
    };
  }
}
