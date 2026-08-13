import { HierarchicalDocumentTree, ASTNode, ParagraphNode, TextRunNode, TableNode, CommentNode, SpeakerNoteNode } from './HierarchicalDocumentTree.js';
import { ExtractedQuestion, QuestionOption } from './types.js';

export interface SemanticQuestionBlock {
  id: string;
  stem: string;
  stemRuns: TextRunNode[];
  options: QuestionOption[];
  correctAnswer?: string | string[];
  explanation?: string;
  associatedParagraphs: ParagraphNode[];
  associatedTables: TableNode[];
  associatedComments: CommentNode[];
  associatedSpeakerNote?: SpeakerNoteNode;
  hyperlinks: string[];
  formattingSummary: {
    hasBold: boolean;
    hasItalic: boolean;
    hasUnderline: boolean;
  };
}

export class SemanticQuestionBlockAssociator {
  /**
   * Bind native AST nodes directly to Semantic Question Blocks
   */
  public static associate(
    tree: HierarchicalDocumentTree,
    rawQuestions: ExtractedQuestion[]
  ): SemanticQuestionBlock[] {
    const questionBlocks: SemanticQuestionBlock[] = [];
    const allParagraphs = tree.getAllParagraphs();
    const allRuns = tree.getAllRuns();

    rawQuestions.forEach((q, qIdx) => {
      // Find matching paragraph node for the question stem
      const stemPara = allParagraphs.find(p => p.plainText.includes(q.stem.substring(0, 30))) || {
        id: `stem_fallback_${qIdx}`,
        type: 'paragraph' as const,
        runs: [{ id: `r_stem_${qIdx}`, type: 'run' as const, text: q.stem, formatting: {} }],
        plainText: q.stem,
      };

      // Collect associated comments
      const commentIds = new Set<string>();
      stemPara.runs.forEach(r => {
        if (r.formatting.commentId) commentIds.add(r.formatting.commentId);
      });
      const associatedComments = tree.comments.filter(c => commentIds.has(c.id));

      // Collect associated hyperlinks
      const hyperlinks = stemPara.runs
        .map(r => r.formatting.hyperlinkUrl)
        .filter((h): h is string => Boolean(h));

      // Find speaker notes for current slide if PPTX
      const speakerNote = tree.speakerNotes.find(sn => 
        sn.text.includes(q.stem.substring(0, 20)) || (q.correctAnswer && sn.text.includes(String(q.correctAnswer)))
      );

      // Check formatting features
      const hasBold = stemPara.runs.some(r => r.formatting.bold);
      const hasItalic = stemPara.runs.some(r => r.formatting.italic);
      const hasUnderline = stemPara.runs.some(r => r.formatting.underline);

      questionBlocks.push({
        id: `semantic_q_${qIdx + 1}`,
        stem: q.stem,
        stemRuns: stemPara.runs,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation || (speakerNote ? `Speaker Note: ${speakerNote.text}` : undefined),
        associatedParagraphs: [stemPara],
        associatedTables: q.table ? [this.convertStructuredTableToTableNode(q.table)] : [],
        associatedComments,
        associatedSpeakerNote: speakerNote,
        hyperlinks,
        formattingSummary: {
          hasBold,
          hasItalic,
          hasUnderline,
        },
      });
    });

    return questionBlocks;
  }

  private static convertStructuredTableToTableNode(t: any): TableNode {
    return {
      id: t.id || 'table_associated',
      type: 'table',
      rowCount: t.rowCount || 1,
      columnCount: t.columnCount || 1,
      headers: t.headers || [],
      grid: [],
      caption: t.caption,
    };
  }
}
