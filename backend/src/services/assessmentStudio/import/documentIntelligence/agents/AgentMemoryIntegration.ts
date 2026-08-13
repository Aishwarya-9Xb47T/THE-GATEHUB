/**
 * Agent Memory Integration
 * Integrates agents with the working memory system for context reconstruction
 */

import { WorkingMemory, DocumentObject, ObjectType } from '../types.js';

export class AgentMemoryIntegration {
  private memory: WorkingMemory;

  constructor(memory: WorkingMemory) {
    this.memory = memory;
  }

  /**
   * Update working memory based on node classification
   */
  updateMemoryFromClassification(node: DocumentObject, classification: ObjectType): void {
    switch (classification) {
      case 'Heading':
        this.updateSectionFromHeading(node);
        break;
      case 'Question':
        this.startQuestionInMemory(node);
        break;
      case 'Option':
        this.addOptionToActiveQuestion(node);
        break;
      case 'AnswerKey':
        this.addAnswerToActiveQuestion(node);
        break;
      case 'Image':
      case 'Diagram':
        this.addDiagramToPage(node);
        break;
      case 'Table':
        this.addTableToPage(node);
        break;
    }
  }

  /**
   * Update section from heading
   */
  private updateSectionFromHeading(node: DocumentObject): void {
    if (node.content) {
      this.memory.context.currentSection = node.content;
      console.log(`[AgentMemoryIntegration] Updated section: ${node.content}`);
    }
  }

  /**
   * Start a new question in memory
   */
  private startQuestionInMemory(node: DocumentObject): void {
    // End previous question if active
    if (this.memory.activeQuestion) {
      this.endQuestionInMemory();
    }

    // Start new question
    this.memory.activeQuestion = {
      id: node.id,
      startedPage: node.page,
      components: {
        statement: node.content,
      },
    };

    // Record in page context
    this.ensurePageContext(node.page).questionsStarted.push(node.id);

    console.log(`[AgentMemoryIntegration] Started question: ${node.id} on page ${node.page}`);
  }

  /**
   * Add option to active question
   */
  private addOptionToActiveQuestion(node: DocumentObject): void {
    if (!this.memory.activeQuestion) {
      console.warn('[AgentMemoryIntegration] No active question to add option to');
      return;
    }

    if (!this.memory.activeQuestion.components.options) {
      this.memory.activeQuestion.components.options = [];
    }

    this.memory.activeQuestion.components.options.push({
      id: node.id,
      marker: this.extractOptionMarker(node.content || ''),
      text: node.content || '',
      isCorrect: false, // Will be determined later
      confidence: node.confidence,
    });

    console.log(`[AgentMemoryIntegration] Added option to question: ${node.id}`);
  }

  /**
   * Add answer to active question
   */
  private addAnswerToActiveQuestion(node: DocumentObject): void {
    if (!this.memory.activeQuestion) {
      console.warn('[AgentMemoryIntegration] No active question to add answer to');
      return;
    }

    this.memory.activeQuestion.components.answer = node.content;
    console.log(`[AgentMemoryIntegration] Added answer to question: ${this.memory.activeQuestion.id}`);
  }

  /**
   * Add diagram to page context
   */
  private addDiagramToPage(node: DocumentObject): void {
    const diagram = {
      id: node.id,
      bbox: node.bbox,
      type: node.type === 'Diagram' ? 'diagram' : 'photo',
      caption: node.content,
      confidence: node.confidence,
    };

    this.ensurePageContext(node.page).diagrams.push(diagram);
    console.log(`[AgentMemoryIntegration] Added diagram to page ${node.page}`);
  }

  /**
   * Add table to page context
   */
  private addTableToPage(node: DocumentObject): void {
    const table = {
      id: node.id,
      bbox: node.bbox,
      rows: 0, // Would be extracted from content
      cols: 0, // Would be extracted from content
      headers: [],
      cells: [],
      confidence: node.confidence,
    };

    this.ensurePageContext(node.page).tables.push(table);
    console.log(`[AgentMemoryIntegration] Added table to page ${node.page}`);
  }

  /**
   * End active question in memory
   */
  private endQuestionInMemory(): void {
    if (!this.memory.activeQuestion) {
      return;
    }

    const questionId = this.memory.activeQuestion.id;
    const page = this.memory.activeQuestion.startedPage;

    // Record in page context
    this.ensurePageContext(page).questionsEnded.push(questionId);

    // Add to previous questions
    this.memory.context.previousQuestions.push(questionId);

    console.log(`[AgentMemoryIntegration] Ended question: ${questionId}`);

    // Clear active question
    this.memory.activeQuestion = undefined;
  }

  /**
   * Extract option marker from content
   */
  private extractOptionMarker(content: string): string {
    const match = content.match(/^([a-eA-E0-9])[\.\)]\s+/);
    return match ? match[1] : '';
  }

  /**
   * Ensure page context exists
   */
  private ensurePageContext(page: number): any {
    if (!this.memory.pageContext.has(page)) {
      this.memory.pageContext.set(page, {
        questionsStarted: [],
        questionsEnded: [],
        diagrams: [],
        tables: [],
      });
    }
    return this.memory.pageContext.get(page);
  }

  /**
   * Get working memory
   */
  getMemory(): WorkingMemory {
    return this.memory;
  }

  /**
   * Update working memory
   */
  updateMemory(updates: Partial<WorkingMemory>): void {
    this.memory = { ...this.memory, ...updates };
  }

  /**
   * Check if question spans pages
   */
  doesQuestionSpanPages(questionId: string): boolean {
    for (const [page, context] of this.memory.pageContext.entries()) {
      if (context.questionsStarted.includes(questionId) && !context.questionsEnded.includes(questionId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get pages for question
   */
  getPagesForQuestion(questionId: string): number[] {
    const pages: number[] = [];

    for (const [page, context] of this.memory.pageContext.entries()) {
      if (context.questionsStarted.includes(questionId) || context.questionsEnded.includes(questionId)) {
        pages.push(page);
      }
    }

    return pages;
  }

  /**
   * Reconstruct question from memory
   */
  reconstructQuestion(questionId: string): {
    statement?: string;
    options?: any[];
    diagram?: any;
    table?: any;
    answer?: string;
    pages: number[];
  } {
    const pages = this.getPagesForQuestion(questionId);
    const reconstruction: any = { pages };

    // Find the question in memory (would need to store completed questions)
    // For now, return empty reconstruction
    return reconstruction;
  }

  /**
   * Get memory statistics
   */
  getStatistics(): {
    activeQuestion: string | undefined;
    totalQuestionsTracked: number;
    totalPagesTracked: number;
    totalDiagramsTracked: number;
    totalTablesTracked: number;
  } {
    let totalDiagrams = 0;
    let totalTables = 0;

    for (const context of this.memory.pageContext.values()) {
      totalDiagrams += context.diagrams.length;
      totalTables += context.tables.length;
    }

    return {
      activeQuestion: this.memory.activeQuestion?.id,
      totalQuestionsTracked: this.memory.context.previousQuestions.length,
      totalPagesTracked: this.memory.pageContext.size,
      totalDiagramsTracked: totalDiagrams,
      totalTablesTracked: totalTables,
    };
  }

  /**
   * Reset memory
   */
  reset(): void {
    this.memory = {
      activeQuestion: undefined,
      context: {
        currentSection: '',
        currentTopic: '',
        previousQuestions: [],
      },
      pageContext: new Map(),
    };
    console.log('[AgentMemoryIntegration] Memory reset');
  }
}
