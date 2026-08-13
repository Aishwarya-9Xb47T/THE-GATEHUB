/**
 * Context Reconstructor
 * Enhances context reconstruction for page-spanning questions
 * Reconstructs complete questions that span multiple pages
 */

import { DocumentGraph } from '../DocumentGraph.js';
import { WorkingMemory, QuestionObject, DocumentObject } from '../types.js';

interface ReconstructionResult {
  reconstructedQuestions: QuestionObject[];
  pageSpanningQuestions: Array<{
    questionId: string;
    pages: number[];
    components: string[];
  }>;
  confidence: number;
}

export class ContextReconstructor {
  private documentGraph: DocumentGraph;
  private workingMemory: WorkingMemory;

  constructor(documentGraph: DocumentGraph, workingMemory: WorkingMemory) {
    this.documentGraph = documentGraph;
    this.workingMemory = workingMemory;
  }

  /**
   * Reconstruct context for all questions, especially page-spanning ones
   */
  reconstruct(questions: QuestionObject[]): ReconstructionResult {
    console.log('[ContextReconstructor] Starting context reconstruction');

    const reconstructedQuestions: QuestionObject[] = [];
    const pageSpanningQuestions: Array<{
      questionId: string;
      pages: number[];
      components: string[];
    }> = [];

    for (const question of questions) {
      const pages = this.getPagesForQuestion(question.id);

      if (pages.length > 1) {
        // Page-spanning question
        console.log(`[ContextReconstructor] Reconstructing page-spanning question ${question.id}`);
        
        const reconstructed = this.reconstructPageSpanningQuestion(question, pages);
        reconstructedQuestions.push(reconstructed);

        pageSpanningQuestions.push({
          questionId: question.id,
          pages,
          components: this.getQuestionComponents(question),
        });
      } else {
        // Single-page question
        reconstructedQuestions.push(question);
      }
    }

    // Calculate overall confidence
    const confidence = this.calculateConfidence(reconstructedQuestions, pageSpanningQuestions);

    console.log(`[ContextReconstructor] Reconstructed ${reconstructedQuestions.length} questions, ${pageSpanningQuestions.length} page-spanning`);

    return {
      reconstructedQuestions,
      pageSpanningQuestions,
      confidence,
    };
  }

  /**
   * Get pages for a question using working memory
   */
  private getPagesForQuestion(questionId: string): number[] {
    const pages: number[] = [];

    for (const [page, context] of this.workingMemory.pageContext.entries()) {
      if (context.questionsStarted.includes(questionId) || context.questionsEnded.includes(questionId)) {
        pages.push(page);
      }
    }

    return pages.sort((a, b) => a - b);
  }

  /**
   * Reconstruct a page-spanning question
   */
  private reconstructPageSpanningQuestion(question: QuestionObject, pages: number[]): QuestionObject {
    const allNodes = this.documentGraph.getAllNodes();
    const questionNode = allNodes.find(n => n.id === question.id);

    if (!questionNode) {
      return question;
    }

    // Collect content from all pages
    const reconstructed = { ...question };

    // Collect options from all pages
    const options = this.collectOptionsAcrossPages(questionNode, allNodes, pages);
    if (options.length > 0) {
      reconstructed.options = options;
    }

    // Collect diagrams from all pages
    const diagrams = this.collectDiagramsAcrossPages(questionNode, allNodes, pages);
    if (diagrams.length > 0) {
      reconstructed.context.diagrams = diagrams;
      if (diagrams.length > 0) {
        reconstructed.diagram = diagrams[0];
      }
    }

    // Collect tables from all pages
    const tables = this.collectTablesAcrossPages(questionNode, allNodes, pages);
    if (tables.length > 0) {
      reconstructed.context.tables = tables;
      if (tables.length > 0) {
        reconstructed.table = tables[0];
      }
    }

    // Collect context paragraphs from all pages
    const contextParagraphs = this.collectContextAcrossPages(questionNode, allNodes, pages);
    if (contextParagraphs.length > 0) {
      reconstructed.context.paragraphs = [
        ...reconstructed.context.paragraphs,
        ...contextParagraphs,
      ];
    }

    // Update metadata to indicate page spanning
    reconstructed.metadata.subtopic = `Spans pages ${pages.join(', ')}`;

    // Update confidence
    reconstructed.confidence.questionBoundary = 0.85; // Slightly lower for page-spanning
    reconstructed.confidence.overall = this.calculateQuestionConfidence(reconstructed);

    // Update reasoning tree
    reconstructed.reasoning = {
      decision: `Reconstructed page-spanning question across ${pages.length} pages`,
      confidence: 0.85,
      evidence: [
        { type: 'context', value: `Pages: ${pages.join(', ')}`, confidence: 0.9 },
        { type: 'semantic_intent', value: reconstructed.statement, confidence: 0.8 },
      ],
      alternatives: [],
    };

    return reconstructed;
  }

  /**
   * Collect options across multiple pages
   */
  private collectOptionsAcrossPages(
    questionNode: DocumentObject,
    allNodes: DocumentObject[],
    pages: number[]
  ): any[] {
    const options: any[] = [];
    const questionIndex = allNodes.findIndex(n => n.id === questionNode.id);

    // Search for options across all specified pages
    for (const page of pages) {
      const pageNodes = allNodes.filter(n => n.page === page);
      const pageQuestionIndex = pageNodes.findIndex(n => n.id === questionNode.id);

      if (pageQuestionIndex >= 0) {
        // Look for options after the question on this page
        for (let i = pageQuestionIndex + 1; i < Math.min(pageQuestionIndex + 15, pageNodes.length); i++) {
          const node = pageNodes[i];

          if (node.type === 'Option') {
            const marker = this.extractOptionMarker(node.content || '');
            options.push({
              id: node.id,
              marker,
              text: node.content || '',
              isCorrect: false,
              confidence: node.confidence,
              bbox: node.bbox,
            });
          } else if (node.type === 'Question') {
            // Stop if we hit another question
            break;
          }
        }
      }
    }

    // Remove duplicates
    const uniqueOptions = options.filter((option, index, self) =>
      index === self.findIndex(o => o.text === option.text)
    );

    return uniqueOptions;
  }

  /**
   * Collect diagrams across multiple pages
   */
  private collectDiagramsAcrossPages(
    questionNode: DocumentObject,
    allNodes: DocumentObject[],
    pages: number[]
  ): any[] {
    const diagrams: any[] = [];

    for (const page of pages) {
      const pageNodes = allNodes.filter(n => n.page === page);
      const pageQuestionIndex = pageNodes.findIndex(n => n.id === questionNode.id);

      if (pageQuestionIndex >= 0) {
        // Look for diagrams near the question on this page
        const searchRange = 5;
        const startIndex = Math.max(0, pageQuestionIndex - searchRange);
        const endIndex = Math.min(pageNodes.length, pageQuestionIndex + searchRange);

        for (let i = startIndex; i < endIndex; i++) {
          const node = pageNodes[i];
          if (node.type === 'Image' || node.type === 'Diagram') {
            diagrams.push({
              id: node.id,
              bbox: node.bbox,
              type: node.type === 'Diagram' ? 'diagram' : 'photo',
              caption: node.content,
              confidence: node.confidence,
            });
          }
        }
      }
    }

    // Remove duplicates
    const uniqueDiagrams = diagrams.filter((diagram, index, self) =>
      index === self.findIndex(d => d.id === diagram.id)
    );

    return uniqueDiagrams;
  }

  /**
   * Collect tables across multiple pages
   */
  private collectTablesAcrossPages(
    questionNode: DocumentObject,
    allNodes: DocumentObject[],
    pages: number[]
  ): any[] {
    const tables: any[] = [];

    for (const page of pages) {
      const pageNodes = allNodes.filter(n => n.page === page);
      const pageQuestionIndex = pageNodes.findIndex(n => n.id === questionNode.id);

      if (pageQuestionIndex >= 0) {
        // Look for tables near the question on this page
        const searchRange = 5;
        const startIndex = Math.max(0, pageQuestionIndex - searchRange);
        const endIndex = Math.min(pageNodes.length, pageQuestionIndex + searchRange);

        for (let i = startIndex; i < endIndex; i++) {
          const node = pageNodes[i];
          if (node.type === 'Table') {
            tables.push({
              id: node.id,
              bbox: node.bbox,
              rows: 0,
              cols: 0,
              headers: [],
              cells: [],
              confidence: node.confidence,
            });
          }
        }
      }
    }

    // Remove duplicates
    const uniqueTables = tables.filter((table, index, self) =>
      index === self.findIndex(t => t.id === table.id)
    );

    return uniqueTables;
  }

  /**
   * Collect context paragraphs across multiple pages
   */
  private collectContextAcrossPages(
    questionNode: DocumentObject,
    allNodes: DocumentObject[],
    pages: number[]
  ): string[] {
    const paragraphs: string[] = [];

    for (const page of pages) {
      const pageNodes = allNodes.filter(n => n.page === page);
      const pageQuestionIndex = pageNodes.findIndex(n => n.id === questionNode.id);

      if (pageQuestionIndex >= 0) {
        // Look for paragraphs before the question on this page
        for (let i = Math.max(0, pageQuestionIndex - 5); i < pageQuestionIndex; i++) {
          const node = pageNodes[i];
          if (node.type === 'Paragraph' && node.content) {
            paragraphs.push(node.content);
          }
        }
      }
    }

    return paragraphs;
  }

  /**
   * Get question components for reporting
   */
  private getQuestionComponents(question: QuestionObject): string[] {
    const components: string[] = [];

    if (question.options && question.options.length > 0) {
      components.push(`${question.options.length} options`);
    }

    if (question.diagram) {
      components.push('diagram');
    }

    if (question.table) {
      components.push('table');
    }

    if (question.equations && question.equations.length > 0) {
      components.push(`${question.equations.length} equations`);
    }

    if (question.code) {
      components.push('code');
    }

    return components;
  }

  /**
   * Calculate confidence for reconstruction
   */
  private calculateConfidence(
    questions: QuestionObject[],
    pageSpanningQuestions: Array<{
      questionId: string;
      pages: number[];
      components: string[];
    }>
  ): number {
    if (questions.length === 0) return 0;

    const avgConfidence = questions.reduce(
      (sum, q) => sum + q.confidence.overall,
      0
    ) / questions.length;

    // Slightly reduce confidence if many page-spanning questions
    const pageSpanRatio = pageSpanningQuestions.length / questions.length;
    const confidenceAdjustment = 1 - (pageSpanRatio * 0.1);

    return avgConfidence * confidenceAdjustment;
  }

  /**
   * Calculate confidence for a single question
   */
  private calculateQuestionConfidence(question: QuestionObject): number {
    return (
      question.confidence.ocr * 0.2 +
      question.confidence.layout * 0.15 +
      question.confidence.questionBoundary * 0.2 +
      question.confidence.options * 0.15 +
      question.confidence.answer * 0.2 +
      question.confidence.semantic * 0.1
    );
  }

  /**
   * Extract option marker from content
   */
  private extractOptionMarker(content: string): string {
    const match = content.match(/^([a-eA-E0-9])[\.\)]\s+/);
    return match ? match[1] : '';
  }

  /**
   * Get document graph
   */
  getDocumentGraph(): DocumentGraph {
    return this.documentGraph;
  }

  /**
   * Get working memory
   */
  getWorkingMemory(): WorkingMemory {
    return this.workingMemory;
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalQuestionsTracked: number;
    pageSpanningQuestions: number;
    averagePagesPerQuestion: number;
  } {
    const totalQuestions = this.workingMemory.context.previousQuestions.length;
    let pageSpanningCount = 0;
    let totalPages = 0;

    for (const questionId of this.workingMemory.context.previousQuestions) {
      const pages = this.getPagesForQuestion(questionId);
      if (pages.length > 1) {
        pageSpanningCount++;
        totalPages += pages.length;
      }
    }

    return {
      totalQuestionsTracked: totalQuestions,
      pageSpanningQuestions: pageSpanningCount,
      averagePagesPerQuestion: pageSpanningCount > 0 ? totalPages / pageSpanningCount : 0,
    };
  }
}
