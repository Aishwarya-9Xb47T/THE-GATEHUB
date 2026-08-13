/**
 * Quiz Builder Model Reconstructor
 * 
 * This module transforms the Educational Object Ownership Graph into
 * native Quiz Builder model components, preserving all relationships,
 * formatting, and educational context.
 * 
 * Key Principles:
 * - Reconstruct tables as native Table Components
 * - Reconstruct formulas as native Formula Components  
 * - Reconstruct code as native Code Components
 * - Reconstruct images as native Image Components
 * - Preserve all formatting and relationships
 * - Output is already editable Quiz Builder model
 */

import { EducationalObjectOwnership, OwnedObject } from './EducationalObjectOwnership.js';
import { QuestionObject, QuestionType, BBox } from './types.js';

export interface QuizBuilderQuestion {
  id: string;
  text: string;
  type: QuestionType;
  difficulty: string;
  marks: number;
  negativeMarks: number;
  hint: string | null;
  bloomLevel: string;
  order: number;
  explanation: string | null;
  hints: string[];
  tags: string[];
  estimatedSeconds: number;
  sectionId: string | null;
  media: {
    url?: string;
    kind?: string;
    table?: QuizBuilderTable;
    formula?: QuizBuilderFormula;
    code?: QuizBuilderCode;
  } | null;
  metadata: {
    // Preserve all original metadata
    mediaUrl?: string;
    table?: QuizBuilderTable;
    tables?: QuizBuilderTable[];
    code?: QuizBuilderCode;
    codeBlocks?: QuizBuilderCode[];
    equations?: QuizBuilderFormula[];
    formulas?: QuizBuilderFormula[];
    images?: QuizBuilderImage[];
    diagram?: QuizBuilderImage;
    passage?: any;
    // Additional educational context
    sourcePage?: number;
    bbox?: BBox;
    ownership?: any;
    relationships?: any[];
  };
  options: Array<{
    id: string;
    text: string;
    isCorrect: boolean;
    order: number;
    media?: any;
  }>;
}

export interface QuizBuilderTable {
  id: string;
  html: string;
  headers: string[];
  rows: string[][];
  mergedCells?: Array<{ row: number; col: number; rowspan: number; colspan: number }>;
  caption?: string;
  metadata?: {
    sourceId?: string;
    ownershipType?: string;
    confidence?: number;
  };
}

export interface QuizBuilderFormula {
  id: string;
  latex: string;
  mathml?: string;
  unicode?: string;
  format: 'latex' | 'mathml' | 'unicode';
  type: 'inline' | 'block';
  metadata?: {
    sourceId?: string;
    ownershipType?: string;
    confidence?: number;
  };
}

export interface QuizBuilderCode {
  id: string;
  content: string;
  language: string;
  indentation: number;
  metadata?: {
    sourceId?: string;
    ownershipType?: string;
    confidence?: number;
  };
}

export interface QuizBuilderImage {
  id: string;
  url: string;
  dataUrl?: string;
  caption?: string;
  type: 'diagram' | 'chart' | 'photo' | 'screenshot' | 'other';
  metadata?: {
    sourceId?: string;
    ownershipType?: string;
    confidence?: number;
  };
}

export interface QuizBuilderSection {
  id: string;
  title: string;
  order: number;
  questions: string[];
  metadata?: {
    sourceId?: string;
    bbox?: BBox;
    page?: number;
  };
}

export class QuizBuilderReconstructor {
  private ownership: EducationalObjectOwnership;
  private sourceQuestions: QuestionObject[];
  private reconstructedQuestions: Map<string, QuizBuilderQuestion>;
  private reconstructedSections: Map<string, QuizBuilderSection>;

  constructor(ownership: EducationalObjectOwnership, sourceQuestions: QuestionObject[] = []) {
    this.ownership = ownership;
    this.sourceQuestions = sourceQuestions;
    this.reconstructedQuestions = new Map();
    this.reconstructedSections = new Map();
  }

  /**
   * Main reconstruction entry point
   */
  reconstruct(): {
    questions: QuizBuilderQuestion[];
    sections: QuizBuilderSection[];
    statistics: any;
  } {
    console.log('=== QuizBuilderReconstructor.reconstruct ENTRY ===');
    
    try {
      // Reconstruct questions from ownership boundaries
      this.reconstructQuestions();
      
      // Reconstruct sections
      this.reconstructSections();
      
      // Build relationships between components
      this.reconstructRelationships();
      
      // Calculate statistics
      const statistics = this.calculateStatistics();
      
      console.log('=== QuizBuilderReconstructor.reconstruct EXIT ===', {
        questionsCount: this.reconstructedQuestions.size,
        sectionsCount: this.reconstructedSections.size,
        statistics,
      });

      return {
        questions: Array.from(this.reconstructedQuestions.values()),
        sections: Array.from(this.reconstructedSections.values()),
        statistics,
      };
    } catch (error) {
      console.error('=== QuizBuilderReconstructor.reconstruct ERROR ===', error);
      throw error;
    }
  }

  /**
   * Reconstruct questions from ownership boundaries
   */
  private reconstructQuestions(): void {
    // If source questions are available, use them directly (they already have rich content)
    if (this.sourceQuestions && this.sourceQuestions.length > 0) {
      console.log('[QuizBuilderReconstructor] Using source questions from QuestionObjectAssembler:', this.sourceQuestions.length);
      
      for (const sourceQ of this.sourceQuestions) {
        const qbQuestion: QuizBuilderQuestion = {
          id: sourceQ.id,
          text: sourceQ.statement,
          type: sourceQ.type,
          difficulty: sourceQ.metadata.difficulty || 'medium',
          marks: sourceQ.metadata.marks || 1,
          negativeMarks: 0,
          hint: sourceQ.hint || null,
          bloomLevel: sourceQ.metadata.bloomLevel || 'L2',
          order: 0,
          explanation: sourceQ.explanation || null,
          hints: sourceQ.metadata.hints || [],
          tags: sourceQ.metadata.skills || [],
          estimatedSeconds: 45,
          sectionId: null,
          media: this.buildMediaFromSourceQuestion(sourceQ),
          metadata: this.buildMetadataFromSourceQuestion(sourceQ),
          options: sourceQ.options?.map((opt, idx) => ({
            id: opt.id || `opt-${idx}`,
            text: opt.text,
            isCorrect: opt.isCorrect || false,
            order: idx,
          })) || [],
        };
        
        this.reconstructedQuestions.set(sourceQ.id, qbQuestion);
      }
      return;
    }
    
    // Fallback to ownership-based reconstruction
    console.log('[QuizBuilderReconstructor] No source questions, using ownership graph');
    const exportData = this.ownership.exportForQuizBuilder();
    
    for (const [boundaryId, data] of Object.entries(exportData)) {
      if (data.boundary.type !== 'question') continue;
      
      const question = this.buildQuizBuilderQuestion(boundaryId, data);
      this.reconstructedQuestions.set(boundaryId, question);
    }
  }

  /**
   * Build media from source question
   */
  private buildMediaFromSourceQuestion(sourceQ: QuestionObject): QuizBuilderQuestion['media'] {
    const media: QuizBuilderQuestion['media'] = {
      table: undefined,
      formula: undefined,
      code: undefined,
    };
    
    if (sourceQ.table) {
      media.table = {
        id: `${sourceQ.id}_table`,
        html: (sourceQ.table as any).html || '',
        headers: (sourceQ.table as any).headers || [],
        rows: (sourceQ.table as any).rows || [],
        mergedCells: (sourceQ.table as any).mergedCells || [],
        caption: (sourceQ.table as any).caption || '',
      };
    }
    
    if (sourceQ.code) {
      media.code = {
        id: `${sourceQ.id}_code`,
        content: (sourceQ.code as any).content || (sourceQ.code as any).code || '',
        language: (sourceQ.code as any).language || 'python',
        indentation: (sourceQ.code as any).indentation || 0,
      };
    }
    
    if (sourceQ.diagram) {
      media.url = (sourceQ.diagram as any).url || (sourceQ.diagram as any).dataUrl;
    }
    
    // Return null if no media
    if (!media.table && !media.formula && !media.code && !media.url) {
      return null;
    }
    
    return media;
  }

  /**
   * Build metadata from source question
   */
  private buildMetadataFromSourceQuestion(sourceQ: QuestionObject): QuizBuilderQuestion['metadata'] {
    const metadata: QuizBuilderQuestion['metadata'] = {
      sourcePage: sourceQ.sourcePage,
      bbox: sourceQ.bbox,
    };
    
    // Preserve table data
    if (sourceQ.table) {
      metadata.table = {
        id: `${sourceQ.id}_table`,
        html: (sourceQ.table as any).html || '',
        headers: (sourceQ.table as any).headers || [],
        rows: (sourceQ.table as any).rows || [],
        mergedCells: (sourceQ.table as any).mergedCells || [],
        caption: (sourceQ.table as any).caption || '',
      };
      metadata.tables = [metadata.table];
    }
    
    // Preserve code data
    if (sourceQ.code) {
      metadata.code = {
        id: `${sourceQ.id}_code`,
        content: (sourceQ.code as any).content || (sourceQ.code as any).code || '',
        language: (sourceQ.code as any).language || 'python',
        indentation: (sourceQ.code as any).indentation || 0,
      };
      metadata.codeBlocks = [metadata.code];
    }
    
    return metadata;
  }

  /**
   * Build a Quiz Builder question from ownership data
   */
  private buildQuizBuilderQuestion(boundaryId: string, data: any): QuizBuilderQuestion {
    const primaryObjects = data.ownedObjects.primary || [];
    const contextObjects = data.ownedObjects.context || [];
    const referenceObjects = data.ownedObjects.reference || [];
    
    // Extract question text from context or primary objects
    const questionText = this.extractQuestionText(contextObjects, primaryObjects);
    
    // Determine question type from structure
    const questionType = this.inferQuestionType(primaryObjects, contextObjects);
    
    // Build media components
    const media = this.buildMediaComponents(primaryObjects);
    
    // Build options if available
    const options = this.buildOptions(primaryObjects, contextObjects);
    
    // Build metadata preserving all ownership information
    const metadata = this.buildQuestionMetadata(boundaryId, data, primaryObjects, contextObjects, referenceObjects);
    
    return {
      id: boundaryId,
      text: questionText,
      type: questionType,
      difficulty: 'medium', // Would be inferred from content
      marks: 1, // Would be inferred from content
      negativeMarks: 0,
      hint: this.extractHint(contextObjects),
      bloomLevel: 'L2', // Would be inferred from content
      order: 0, // Would be set from reading order
      explanation: this.extractExplanation(contextObjects),
      hints: this.extractHints(contextObjects),
      tags: this.extractTags(contextObjects),
      estimatedSeconds: 45, // Would be inferred from complexity
      sectionId: null, // Would be set from section membership
      media,
      metadata,
      options,
    };
  }

  /**
   * Extract question text from context and primary objects
   */
  private extractQuestionText(contextObjects: OwnedObject[], primaryObjects: OwnedObject[]): string {
    // Look for paragraph objects that contain the question
    const paragraphs = contextObjects.filter(obj => obj.type === 'Paragraph');
    
    if (paragraphs.length > 0) {
      return paragraphs.map(p => p.content || '').join('\n');
    }
    
    // Fallback to any text content
    const allTextObjects = [...contextObjects, ...primaryObjects].filter(obj => obj.content);
    return allTextObjects.map(obj => obj.content || '').join('\n');
  }

  /**
   * Infer question type from object structure
   */
  private inferQuestionType(primaryObjects: OwnedObject[], contextObjects: OwnedObject[]): QuestionType {
    // Check for table-based question
    if (primaryObjects.some(obj => obj.type === 'Table')) {
      return 'table_question';
    }
    
    // Check for code-based question
    if (primaryObjects.some(obj => obj.type === 'CodeBlock' || obj.type === 'ProgrammingBlock')) {
      return 'code_question';
    }
    
    // Check for image/diagram-based question
    if (primaryObjects.some(obj => obj.type === 'Image' || obj.type === 'Diagram')) {
      return 'image_question';
    }
    
    // Check for equation-based question
    if (primaryObjects.some(obj => obj.type === 'Equation' || obj.type === 'Formula')) {
      return 'equation_question';
    }
    
    // Check for matching options
    const options = primaryObjects.filter(obj => obj.type === 'Option');
    if (options.length >= 4) {
      return 'multiple_choice';
    }
    
    // Default to multiple choice
    return 'multiple_choice';
  }

  /**
   * Build media components from primary objects
   */
  private buildMediaComponents(primaryObjects: OwnedObject[]): QuizBuilderQuestion['media'] {
    const media: QuizBuilderQuestion['media'] = {
      table: undefined,
      formula: undefined,
      code: undefined,
    };
    
    for (const obj of primaryObjects) {
      switch (obj.type) {
        case 'Table':
          media.table = this.buildTableComponent(obj);
          break;
        case 'Equation':
        case 'Formula':
          media.formula = this.buildFormulaComponent(obj);
          break;
        case 'CodeBlock':
        case 'ProgrammingBlock':
          media.code = this.buildCodeComponent(obj);
          break;
        case 'Image':
        case 'Diagram':
          media.url = obj.metadata?.url || obj.metadata?.dataUrl;
          break;
      }
    }
    
    // Return null if no media components
    if (!media.table && !media.formula && !media.code && !media.url) {
      return null;
    }
    
    return media;
  }

  /**
   * Build native Table component
   */
  private buildTableComponent(obj: OwnedObject): QuizBuilderTable {
    return {
      id: obj.id,
      html: obj.content || '',
      headers: obj.metadata?.headers || [],
      rows: obj.metadata?.rows || [],
      mergedCells: obj.metadata?.mergedCells || [],
      caption: obj.metadata?.caption,
      metadata: {
        sourceId: obj.id,
        ownershipType: obj.ownershipType,
        confidence: 1,
      },
    };
  }

  /**
   * Build native Formula component
   */
  private buildFormulaComponent(obj: OwnedObject): QuizBuilderFormula {
    return {
      id: obj.id,
      latex: obj.content || '',
      mathml: obj.metadata?.mathml,
      unicode: obj.metadata?.unicode,
      format: obj.metadata?.format || 'latex',
      type: obj.metadata?.type || 'block',
      metadata: {
        sourceId: obj.id,
        ownershipType: obj.ownershipType,
        confidence: 1,
      },
    };
  }

  /**
   * Build native Code component
   */
  private buildCodeComponent(obj: OwnedObject): QuizBuilderCode {
    return {
      id: obj.id,
      content: obj.content || '',
      language: obj.metadata?.language || 'python',
      indentation: obj.metadata?.indentation || 0,
      metadata: {
        sourceId: obj.id,
        ownershipType: obj.ownershipType,
        confidence: 1,
      },
    };
  }

  /**
   * Build options from primary objects
   */
  private buildOptions(primaryObjects: OwnedObject[], contextObjects: OwnedObject[]): Array<{
    id: string;
    text: string;
    isCorrect: boolean;
    order: number;
  }> {
    const optionObjects = primaryObjects.filter(obj => obj.type === 'Option');
    
    return optionObjects.map((obj, index) => ({
      id: obj.id,
      text: obj.content || '',
      isCorrect: obj.metadata?.isCorrect || false,
      order: index,
    }));
  }

  /**
   * Build comprehensive metadata preserving all ownership information
   */
  private buildQuestionMetadata(
    boundaryId: string,
    data: any,
    primaryObjects: OwnedObject[],
    contextObjects: OwnedObject[],
    referenceObjects: OwnedObject[]
  ): QuizBuilderQuestion['metadata'] {
    const metadata: QuizBuilderQuestion['metadata'] = {
      ownership: {
        boundaryId,
        primaryObjectIds: primaryObjects.map(obj => obj.id),
        contextObjectIds: contextObjects.map(obj => obj.id),
        referenceObjectIds: referenceObjects.map(obj => obj.id),
        relationships: data.relationships || [],
      },
      sourcePage: data.boundary.page,
      bbox: data.boundary.bbox,
    };
    
    // Add table components
    const tables = primaryObjects.filter(obj => obj.type === 'Table');
    if (tables.length > 0) {
      metadata.tables = tables.map(t => this.buildTableComponent(t));
      metadata.table = metadata.tables[0];
    }
    
    // Add code components
    const codeBlocks = primaryObjects.filter(obj => obj.type === 'CodeBlock' || obj.type === 'ProgrammingBlock');
    if (codeBlocks.length > 0) {
      metadata.codeBlocks = codeBlocks.map(c => this.buildCodeComponent(c));
      metadata.code = metadata.codeBlocks[0];
    }
    
    // Add formula components
    const equations = primaryObjects.filter(obj => obj.type === 'Equation' || obj.type === 'Formula');
    if (equations.length > 0) {
      // Check if equations are actually numbered list items
      const allNumbered = equations.every(eq => {
        const latex = eq.metadata?.latex || eq.content || '';
        return /^\s*\d+\.\s+/.test(latex);
      });
      
      if (allNumbered && equations.length > 1) {
        // This is a numbered list, extract as list instead
        const listItems = equations.map(eq => {
          const latex = eq.metadata?.latex || eq.content || '';
          return latex.replace(/^\s*\d+\.\s*/, '').trim();
        });
        metadata.lists = [{
          id: equations[0].id,
          type: 'ordered',
          items: listItems,
          confidence: equations[0].confidence || 1,
        }];
        // Don't set formulas since we've reclassified as list
      } else {
        metadata.equations = equations.map(e => this.buildFormulaComponent(e));
        metadata.formulas = metadata.equations.map(e => e.latex);
      }
    }
    
    // Add image components
    const images = primaryObjects.filter(obj => obj.type === 'Image' || obj.type === 'Diagram');
    if (images.length > 0) {
      metadata.images = images.map(img => ({
        id: img.id,
        url: img.metadata?.url || img.metadata?.dataUrl,
        dataUrl: img.metadata?.dataUrl,
        caption: img.metadata?.caption,
        type: img.metadata?.type || 'other',
      }));
      if (metadata.images.length > 0) {
        metadata.diagram = metadata.images[0];
        metadata.mediaUrl = metadata.images[0].url;
      }
    }
    
    return metadata;
  }

  /**
   * Extract hint from context objects
   */
  private extractHint(contextObjects: OwnedObject[]): string | null {
    const hintObjects = contextObjects.filter(obj => obj.type === 'Hint');
    return hintObjects.length > 0 ? hintObjects[0].content || null : null;
  }

  /**
   * Extract explanation from context objects
   */
  private extractExplanation(contextObjects: OwnedObject[]): string | null {
    const explanationObjects = contextObjects.filter(obj => obj.type === 'Explanation');
    return explanationObjects.length > 0 ? explanationObjects[0].content || null : null;
  }

  /**
   * Extract hints from context objects
   */
  private extractHints(contextObjects: OwnedObject[]): string[] {
    const hintObjects = contextObjects.filter(obj => obj.type === 'Hint');
    return hintObjects.map(obj => obj.content || '').filter(Boolean);
  }

  /**
   * Extract tags from context objects
   */
  private extractTags(contextObjects: OwnedObject[]): string[] {
    const tagObjects = contextObjects.filter(obj => obj.type === 'LearningObjective');
    return tagObjects.map(obj => obj.content || '').filter(Boolean);
  }

  /**
   * Reconstruct sections from ownership boundaries
   */
  private reconstructSections(): void {
    const exportData = this.ownership.exportForQuizBuilder();
    
    for (const [boundaryId, data] of Object.entries(exportData)) {
      if (data.boundary.type !== 'section') continue;
      
      const section = this.buildQuizBuilderSection(boundaryId, data);
      this.reconstructedSections.set(boundaryId, section);
    }
  }

  /**
   * Build a Quiz Builder section from ownership data
   */
  private buildQuizBuilderSection(boundaryId: string, data: any): QuizBuilderSection {
    // Find questions that belong to this section
    const sectionQuestions = Array.from(this.reconstructedQuestions.keys()).filter(qId => {
      const question = this.reconstructedQuestions.get(qId);
      return question?.metadata?.ownership?.primaryObjectIds?.some((objId: string) => {
        const obj = data.ownedObjects.all?.find((o: any) => o.id === objId);
        return obj && obj.ownershipType === 'context';
      });
    });

    return {
      id: boundaryId,
      title: data.boundary.boundaryId || 'Section', // Would be extracted from heading
      order: 0, // Would be set from reading order
      questions: sectionQuestions,
      metadata: {
        sourceId: boundaryId,
        bbox: data.boundary.bbox,
        page: data.boundary.page,
      },
    };
  }

  /**
   * Reconstruct relationships between components
   */
  private reconstructRelationships(): void {
    // This would establish relationships between questions, sections, and their components
    // For now, relationships are preserved in metadata
  }

  /**
   * Calculate reconstruction statistics
   */
  private calculateStatistics(): any {
    const questions = Array.from(this.reconstructedQuestions.values());
    
    const typeDistribution: Record<string, number> = {};
    const mediaDistribution: Record<string, number> = {};
    
    for (const question of questions) {
      typeDistribution[question.type] = (typeDistribution[question.type] || 0) + 1;
      
      if (question.media?.table) mediaDistribution['table'] = (mediaDistribution['table'] || 0) + 1;
      if (question.media?.formula) mediaDistribution['formula'] = (mediaDistribution['formula'] || 0) + 1;
      if (question.media?.code) mediaDistribution['code'] = (mediaDistribution['code'] || 0) + 1;
      if (question.media?.url) mediaDistribution['image'] = (mediaDistribution['image'] || 0) + 1;
    }
    
    return {
      totalQuestions: questions.length,
      totalSections: this.reconstructedSections.size,
      typeDistribution,
      mediaDistribution,
      questionsWithMedia: questions.filter(q => q.media).length,
      questionsWithOptions: questions.filter(q => q.options && q.options.length > 0).length,
    };
  }

  /**
   * Export questions in saveQuizEditor format
   */
  exportForSaveQuizEditor(): Array<{
    id?: string;
    text: string;
    type: string;
    difficulty?: string;
    marks?: number;
    negativeMarks?: number;
    hint?: string;
    bloomLevel?: string;
    order?: number;
    explanation?: string;
    hints?: string[];
    tags?: string[];
    estimatedSeconds?: number;
    sectionId?: string;
    media?: unknown;
    metadata?: Record<string, unknown>;
    options?: Array<{ id?: string; text: string; isCorrect: boolean; order?: number }>;
  }> {
    return Array.from(this.reconstructedQuestions.values()).map(q => ({
      id: q.id,
      text: q.text,
      type: q.type,
      difficulty: q.difficulty,
      marks: q.marks,
      negativeMarks: q.negativeMarks,
      hint: q.hint,
      bloomLevel: q.bloomLevel,
      order: q.order,
      explanation: q.explanation,
      hints: q.hints,
      tags: q.tags,
      estimatedSeconds: q.estimatedSeconds,
      sectionId: q.sectionId,
      media: q.media,
      metadata: q.metadata,
      options: q.options,
    }));
  }
}