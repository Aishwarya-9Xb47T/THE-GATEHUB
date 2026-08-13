/**
 * Working Memory System
 * Enables context reconstruction across pages and components
 */

import {
  WorkingMemory,
  WorkingMemoryContext,
  PageContext,
  ActiveQuestion,
  DiagramReference,
  TableReference,
  OptionObject,
} from './types.js';

export class WorkingMemorySystem {
  private memory: WorkingMemory;

  constructor() {
    this.memory = this.initialize();
  }

  /**
   * Initialize working memory
   */
  private initialize(): WorkingMemory {
    return {
      activeQuestion: undefined,
      context: {
        currentSection: '',
        currentTopic: '',
        previousQuestions: [],
      },
      pageContext: new Map(),
    };
  }

  /**
   * Get current working memory
   */
  getMemory(): WorkingMemory {
    return this.memory;
  }

  /**
   * Start a new active question
   */
  startQuestion(questionId: string, page: number): void {
    this.memory.activeQuestion = {
      id: questionId,
      startedPage: page,
      components: {},
    };

    // Record in page context
    this.ensurePageContext(page).questionsStarted.push(questionId);

    console.log('[WorkingMemory] Started question:', questionId, 'on page:', page);
  }

  /**
   * Add component to active question
   */
  addComponent(component: keyof ActiveQuestion['components'], value: any): void {
    if (!this.memory.activeQuestion) {
      console.warn('[WorkingMemory] No active question to add component to');
      return;
    }

    this.memory.activeQuestion.components[component] = value;
    console.log('[WorkingMemory] Added component:', component, 'to question:', this.memory.activeQuestion.id);
  }

  /**
   * End active question
   */
  endQuestion(): void {
    if (!this.memory.activeQuestion) {
      console.warn('[WorkingMemory] No active question to end');
      return;
    }

    const questionId = this.memory.activeQuestion.id;
    const page = this.memory.activeQuestion.startedPage;

    // Record in page context
    this.ensurePageContext(page).questionsEnded.push(questionId);

    // Add to previous questions
    this.memory.context.previousQuestions.push(questionId);

    console.log('[WorkingMemory] Ended question:', questionId);

    // Clear active question
    this.memory.activeQuestion = undefined;
  }

  /**
   * Get active question
   */
  getActiveQuestion(): ActiveQuestion | undefined {
    return this.memory.activeQuestion;
  }

  /**
   * Set current section
   */
  setCurrentSection(section: string): void {
    this.memory.context.currentSection = section;
    console.log('[WorkingMemory] Set current section:', section);
  }

  /**
   * Set current topic
   */
  setCurrentTopic(topic: string): void {
    this.memory.context.currentTopic = topic;
    console.log('[WorkingMemory] Set current topic:', topic);
  }

  /**
   * Add diagram to page context
   */
  addDiagramToPage(page: number, diagram: DiagramReference): void {
    this.ensurePageContext(page).diagrams.push(diagram);
    console.log('[WorkingMemory] Added diagram to page:', page);
  }

  /**
   * Add table to page context
   */
  addTableToPage(page: number, table: TableReference): void {
    this.ensurePageContext(page).tables.push(table);
    console.log('[WorkingMemory] Added table to page:', page);
  }

  /**
   * Get diagrams on page
   */
  getDiagramsOnPage(page: number): DiagramReference[] {
    return this.ensurePageContext(page).diagrams;
  }

  /**
   * Get tables on page
   */
  getTablesOnPage(page: number): TableReference[] {
    return this.ensurePageContext(page).tables;
  }

  /**
   * Get questions started on page
   */
  getQuestionsStartedOnPage(page: number): string[] {
    return this.ensurePageContext(page).questionsStarted;
  }

  /**
   * Get questions ended on page
   */
  getQuestionsEndedOnPage(page: number): string[] {
    return this.ensurePageContext(page).questionsEnded;
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
   * Ensure page context exists
   */
  private ensurePageContext(page: number): PageContext {
    if (!this.memory.pageContext.has(page)) {
      this.memory.pageContext.set(page, {
        questionsStarted: [],
        questionsEnded: [],
        diagrams: [],
        tables: [],
      });
    }
    return this.memory.pageContext.get(page)!;
  }

  /**
   * Reset working memory
   */
  reset(): void {
    this.memory = this.initialize();
    console.log('[WorkingMemory] Reset');
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
}
