/**
 * Structure Preservation Extractor
 * 
 * PRIMARY GOAL: STRUCTURE PRESERVATION
 * 
 * Rules:
 * 1. Document is source of truth - do NOT reorganize anything
 * 2. Every question acts as a ROOT NODE
 * 3. Preserve component order exactly
 * 4. Treat every component as a sequential block
 * 5. Never move/reorder/merge/split components
 * 6. Follow document flow (top→bottom→left→right)
 * 7. Every component has position info (id, type, parentQuestionId, orderIndex, sourcePage, boundingBox, startOffset, endOffset)
 * 8. Output is component-based (Question with components array)
 * 9. Frontend renders by sort(orderIndex) - extraction provides ordering
 * 10. Attach components ONLY by physical document position
 * 11. Don't confuse component types (lists are not formulas, tables are not lists, etc.)
 * 12. Preserve formatting exactly (spacing, indentation, numbering, rich text)
 * 13. Output ordered tree, not flat JSON
 */

import {
  StructuredDocument,
  StructuredQuestion,
  DocumentComponent,
  ComponentType,
  ComponentPosition,
  ComponentData,
  Formatting,
  QuestionData,
  ParagraphData,
  HeadingData,
  ImageData,
  FormulaData,
  CodeData,
  TableData,
  ListData,
  OptionsData,
  OptionData,
  ExplanationData,
  HintData,
  MetadataData,
  BreakData,
  HeaderData,
  FooterData,
  PageNumberData,
  SectionBreakData,
  WhitespaceData,
} from './structurePreservationTypes.js';
import { randomUUID } from 'crypto';

export class StructurePreservationExtractor {
  /**
   * Extract structured document from raw content
   * This is the main entry point for structure preservation
   */
  static async extract(
    content: string,
    sourceType: 'pdf' | 'docx' | 'html' | 'markdown' | 'txt'
  ): Promise<StructuredDocument> {
    console.log('[StructurePreservationExtractor] Starting structure preservation extraction');
    console.log('[StructurePreservationExtractor] Source type:', sourceType);
    console.log('[StructurePreservationExtractor] Content length:', content.length);

    // Parse content based on source type
    const rawComponents = await this.parseContent(content, sourceType);
    
    console.log('[StructurePreservationExtractor] Parsed components:', rawComponents.length);

    // Assign order indices based on document flow (top→bottom→left→right)
    const orderedComponents = this.assignOrderIndices(rawComponents);

    // Group components by question boundaries
    const { questions, rootComponents } = this.groupByQuestionBoundaries(orderedComponents);

    // Extract metadata from Metadata components
    const questionsWithMetadata = this.extractQuestionMetadata(questions);

    const structuredDocument: StructuredDocument = {
      title: this.extractTitle(rootComponents),
      author: this.extractAuthor(rootComponents),
      totalPages: this.extractTotalPages(rootComponents),
      questions: questionsWithMetadata,
      rootComponents,
      confidence: this.calculateOverallConfidence(questionsWithMetadata),
      warnings: this.generateWarnings(questionsWithMetadata),
    };

    console.log('[StructurePreservationExtractor] Extraction complete');
    console.log('[StructurePreservationExtractor] Questions:', structuredDocument.questions.length);
    console.log('[StructurePreservationExtractor] Root components:', structuredDocument.rootComponents.length);

    return structuredDocument;
  }

  /**
   * Parse content into raw components based on source type
   * This is where source-specific parsing happens
   */
  private static async parseContent(
    content: string,
    sourceType: 'pdf' | 'docx' | 'html' | 'markdown' | 'txt'
  ): Promise<DocumentComponent[]> {
    switch (sourceType) {
      case 'docx':
        return this.parseDOCX(content);
      case 'pdf':
        return this.parsePDF(content);
      case 'html':
        return this.parseHTML(content);
      case 'markdown':
        return this.parseMarkdown(content);
      case 'txt':
        return this.parseTXT(content);
      default:
        throw new Error(`Unsupported source type: ${sourceType}`);
    }
  }

  /**
   * Parse DOCX content into components
   * Uses mammoth or similar library to preserve structure
   */
  private static async parseDOCX(content: string): Promise<DocumentComponent[]> {
    console.log('[StructurePreservationExtractor] Parsing DOCX');
    
    // For now, use a simple heuristic-based parser
    // In production, this would use mammoth or similar library
    const components: DocumentComponent[] = [];
    const lines = content.split('\n');
    let currentPage = 1;
    let orderIndex = 0;
    let yOffset = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty lines (but preserve as Whitespace components)
      if (!trimmed) {
        components.push(this.createWhitespaceComponent(currentPage, orderIndex++, yOffset));
        yOffset += 20; // Approximate line height
        continue;
      }

      // Detect component type by pattern
      const componentType = this.detectComponentType(trimmed);
      
      const component = this.createComponent(
        componentType,
        trimmed,
        currentPage,
        orderIndex++,
        { x: 0, y: yOffset, width: 800, height: 40 }
      );
      
      components.push(component);
      yOffset += component.position.boundingBox.height;
      
      // Page break detection
      if (trimmed.includes('\\page') || trimmed.includes('Page Break')) {
        currentPage++;
        yOffset = 0;
      }
    }

    return components;
  }

  /**
   * Parse PDF content into components
   * Uses pdf-parse or similar library to preserve structure
   */
  private static async parsePDF(content: string): Promise<DocumentComponent[]> {
    console.log('[StructurePreservationExtractor] Parsing PDF');
    
    // For now, use simple heuristic parsing
    // In production, this would use pdf-parse with layout analysis
    const components: DocumentComponent[] = [];
    const lines = content.split('\n');
    let currentPage = 1;
    let orderIndex = 0;
    let yOffset = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (!trimmed) {
        components.push(this.createWhitespaceComponent(currentPage, orderIndex++, yOffset));
        yOffset += 20;
        continue;
      }

      const componentType = this.detectComponentType(trimmed);
      const component = this.createComponent(
        componentType,
        trimmed,
        currentPage,
        orderIndex++,
        { x: 0, y: yOffset, width: 800, height: 40 }
      );
      
      components.push(component);
      yOffset += component.position.boundingBox.height;
    }

    return components;
  }

  /**
   * Parse HTML content into components
   * Preserves HTML structure exactly
   */
  private static async parseHTML(content: string): Promise<DocumentComponent[]> {
    console.log('[StructurePreservationExtractor] Parsing HTML');
    
    const components: DocumentComponent[] = [];
    let currentPage = 1;
    let orderIndex = 0;
    let yOffset = 0;

    // Simple HTML parser - in production use a proper HTML parser
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (!trimmed) {
        components.push(this.createWhitespaceComponent(currentPage, orderIndex++, yOffset));
        yOffset += 20;
        continue;
      }

      // Remove HTML tags for content, but preserve structure
      const contentText = trimmed.replace(/<[^>]+>/g, '');
      const componentType = this.detectComponentType(contentText);
      
      const component = this.createComponent(
        componentType,
        contentText,
        currentPage,
        orderIndex++,
        { x: 0, y: yOffset, width: 800, height: 40 }
      );
      
      components.push(component);
      yOffset += component.position.boundingBox.height;
    }

    return components;
  }

  /**
   * Parse Markdown content into components
   * Preserves Markdown structure exactly
   */
  private static async parseMarkdown(content: string): Promise<DocumentComponent[]> {
    console.log('[StructurePreservationExtractor] Parsing Markdown');
    
    const components: DocumentComponent[] = [];
    let currentPage = 1;
    let orderIndex = 0;
    let yOffset = 0;

    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (!trimmed) {
        components.push(this.createWhitespaceComponent(currentPage, orderIndex++, yOffset));
        yOffset += 20;
        continue;
      }

      // Markdown-specific detection
      const componentType = this.detectMarkdownComponentType(trimmed);
      
      const component = this.createComponent(
        componentType,
        trimmed,
        currentPage,
        orderIndex++,
        { x: 0, y: yOffset, width: 800, height: 40 }
      );
      
      components.push(component);
      yOffset += component.position.boundingBox.height;
    }

    return components;
  }

  /**
   * Parse TXT content into components
   * Preserves plain text structure exactly
   */
  private static async parseTXT(content: string): Promise<DocumentComponent[]> {
    console.log('[StructurePreservationExtractor] Parsing TXT');
    
    const components: DocumentComponent[] = [];
    let currentPage = 1;
    let orderIndex = 0;
    let yOffset = 0;

    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (!trimmed) {
        components.push(this.createWhitespaceComponent(currentPage, orderIndex++, yOffset));
        yOffset += 20;
        continue;
      }

      const componentType = this.detectComponentType(trimmed);
      const component = this.createComponent(
        componentType,
        trimmed,
        currentPage,
        orderIndex++,
        { x: 0, y: yOffset, width: 800, height: 40 }
      );
      
      components.push(component);
      yOffset += component.position.boundingBox.height;
    }

    return components;
  }

  /**
   * Detect component type from text content
   * RULE 11: Don't confuse component types
   */
  private static detectComponentType(text: string): ComponentType {
    const lower = text.toLowerCase();

    // Question detection (RULE 2: Every question is a root node)
    if (/^(question|q|problem|exercise|practice)\s*\d*[:\.\)]/i.test(lower)) {
      return 'Question';
    }
    if (/^\d+[\.\)]\s*(which|what|how|why|when|where|who|explain|describe|discuss|analyze|evaluate|calculate|solve|determine|identify|select|choose)/i.test(lower)) {
      return 'Question';
    }
    if (/\?|which|what|how|why|when|where|who|explain|describe|discuss|analyze|evaluate|calculate|solve|determine|identify|select|choose/i.test(lower)) {
      return 'Question';
    }

    // Heading detection
    if (/^(#{1,6}\s|section|chapter|part|unit|module)\s+\d+[:\.\)]?\s*/i.test(lower)) {
      return 'Heading';
    }

    // Option detection
    if (/^[a-e][\)\.\s]/i.test(text)) {
      return 'Option';
    }
    if (/^\d+[\)\.\s]/i.test(text) && text.length < 200) {
      return 'Option';
    }
    if (/^[•\-\*]\s/i.test(text) && text.length < 200) {
      return 'Option';
    }

    // Explanation detection
    if (/^(explanation|reason|rationale|justification|because|since|due to|as|therefore|thus)\s*[:\.\)]?\s*/i.test(lower)) {
      return 'Explanation';
    }

    // Hint detection
    if (/^(hint|clue|tip|note|remember|suggestion|guide)\s*[:\.\)]?\s*/i.test(lower)) {
      return 'Hint';
    }

    // Formula detection (RULE 11: Formula is not code)
    if (/\\frac|\\sum|\\int|E\s*=\s*mc²|a²\s*\+\s*b²\s*=\s*c²|\$\$|\$/i.test(text)) {
      return 'Formula';
    }

    // Code detection (RULE 11: Code is not text)
    if (/def\s+\w+|if\s+n\s*==|return\s+n\s*\*|function\s+\w+|class\s+\w+|#include|import\s+/i.test(text)) {
      return 'Code';
    }

    // Table detection (RULE 11: Table is not list)
    if (/\|.*\|/.test(text) && text.split('|').length > 3) {
      return 'Table';
    }

    // List detection (RULE 11: List is not formula)
    if (/^\s*[-*+]\s|^\s*\d+\.\s/.test(text)) {
      return 'List';
    }

    // Image/video/audio placeholders
    if (/\[image\]|\[diagram\]|\[figure\]/i.test(text)) {
      return 'Image';
    }
    if (/\[video\]/i.test(text)) {
      return 'Video';
    }
    if (/\[audio\]/i.test(text)) {
      return 'Audio';
    }

    // Default to Paragraph
    return 'Paragraph';
  }

  /**
   * Detect component type in Markdown specifically
   */
  private static detectMarkdownComponentType(text: string): ComponentType {
    // Markdown headings
    if (/^#{1,6}\s/.test(text)) {
      return 'Heading';
    }

    // Markdown code blocks
    if (/^```/.test(text)) {
      return 'Code';
    }

    // Markdown images
    if (/!\[.*\]\(.*\)/.test(text)) {
      return 'Image';
    }

    // Markdown lists
    if (/^\s*[-*+]\s|^\s*\d+\.\s/.test(text)) {
      return 'List';
    }

    // Use general detection
    return this.detectComponentType(text);
  }

  /**
   * Create a DocumentComponent
   */
  private static createComponent(
    type: ComponentType,
    content: string,
    page: number,
    orderIndex: number,
    boundingBox: { x: number; y: number; width: number; height: number }
  ): DocumentComponent {
    return {
      id: randomUUID(),
      type,
      position: {
        orderIndex,
        parentQuestionId: null, // Will be assigned during grouping
        sourcePage: page,
        boundingBox,
        startOffset: 0, // Will be calculated
        endOffset: content.length,
        readingOrder: orderIndex,
      },
      content,
      confidence: 0.9,
      warnings: [],
    };
  }

  /**
   * Create a Whitespace component
   */
  private static createWhitespaceComponent(
    page: number,
    orderIndex: number,
    yOffset: number
  ): DocumentComponent {
    return {
      id: randomUUID(),
      type: 'Whitespace',
      position: {
        orderIndex,
        parentQuestionId: null,
        sourcePage: page,
        boundingBox: { x: 0, y: yOffset, width: 800, height: 20 },
        startOffset: 0,
        endOffset: 0,
        readingOrder: orderIndex,
      },
      content: '',
      data: {
        whitespaceType: 'newline',
        amount: 1,
      } as WhitespaceData,
      confidence: 1.0,
      warnings: [],
    };
  }

  /**
   * Assign order indices based on document flow
   * RULE 6: Follow document flow (top→bottom→left→right)
   * RULE 7: Every component has position info
   */
  private static assignOrderIndices(components: DocumentComponent[]): DocumentComponent[] {
    let currentPage = 1;
    let currentY = 0;
    let currentX = 0;
    let orderIndex = 0;
    let globalOffset = 0;

    return components.map((component) => {
      // Update position based on document flow
      if (component.position.sourcePage > currentPage) {
        currentPage = component.position.sourcePage;
        currentY = 0;
        currentX = 0;
      }

      // Assign order index (RULE 7)
      component.position.orderIndex = orderIndex++;
      component.position.readingOrder = orderIndex;
      
      // Assign offsets (RULE 7)
      component.position.startOffset = globalOffset;
      globalOffset += (component.content?.length || 0);
      component.position.endOffset = globalOffset;

      // Update position for next component
      currentY += component.position.boundingBox.height;
      currentX = 0; // Reset X for next line

      return component;
    });
  }

  /**
   * Group components by question boundaries
   * RULE 2: Every question acts as a ROOT NODE
   * RULE 10: Attach components ONLY by physical document position
   */
  private static groupByQuestionBoundaries(
    components: DocumentComponent[]
  ): { questions: StructuredQuestion[]; rootComponents: DocumentComponent[] } {
    const questions: StructuredQuestion[] = [];
    const rootComponents: DocumentComponent[] = [];
    let currentQuestion: StructuredQuestion | null = null;
    let questionOrderIndex = 0;

    for (const component of components) {
      // RULE 2: Question acts as root node
      if (component.type === 'Question') {
        // Save previous question if exists
        if (currentQuestion) {
          questions.push(currentQuestion);
        }

        // Start new question
        currentQuestion = {
          id: component.id,
          components: [component],
          confidence: component.confidence,
          warnings: component.warnings,
        };
        
        // Mark this component as belonging to this question
        component.position.parentQuestionId = component.id;
        questionOrderIndex++;
      } else if (currentQuestion) {
        // Component belongs to current question (RULE 10: physical position)
        component.position.parentQuestionId = currentQuestion.id;
        currentQuestion.components.push(component);
      } else {
        // Component is root-level (before first question)
        component.position.parentQuestionId = null;
        rootComponents.push(component);
      }
    }

    // Don't forget the last question
    if (currentQuestion) {
      questions.push(currentQuestion);
    }

    console.log('[StructurePreservationExtractor] Grouped components:', {
      questions: questions.length,
      rootComponents: rootComponents.length,
    });

    return { questions, rootComponents };
  }

  /**
   * Extract question metadata from Metadata components
   */
  private static extractQuestionMetadata(questions: StructuredQuestion[]): StructuredQuestion[] {
    return questions.map(question => {
      const metadataComponents = question.components.filter(c => c.type === 'Metadata');
      
      if (metadataComponents.length === 0) {
        return question;
      }

      // Extract metadata from Metadata components
      const metadata: StructuredQuestion['metadata'] = {};
      
      for (const metaComp of metadataComponents) {
        const meta = metaComp.data as MetadataData;
        switch (meta.key.toLowerCase()) {
          case 'difficulty':
            metadata.difficulty = meta.value as 'easy' | 'medium' | 'hard';
            break;
          case 'bloomlevel':
            metadata.bloomLevel = meta.value as 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';
            break;
          case 'marks':
            metadata.marks = parseInt(meta.value, 10);
            break;
          case 'estimatedseconds':
            metadata.estimatedSeconds = parseInt(meta.value, 10);
            break;
          case 'topic':
            metadata.topic = meta.value;
            break;
          case 'subtopic':
            metadata.subtopic = meta.value;
            break;
          case 'skills':
            metadata.skills = meta.value.split(',').map(s => s.trim());
            break;
          case 'questiontype':
            metadata.questionType = meta.value;
            break;
        }
      }

      return {
        ...question,
        metadata,
      };
    });
  }

  /**
   * Extract title from root components
   */
  private static extractTitle(rootComponents: DocumentComponent[]): string | undefined {
    const heading = rootComponents.find(c => c.type === 'Heading');
    return heading?.content;
  }

  /**
   * Extract author from root components
   */
  private static extractAuthor(rootComponents: DocumentComponent[]): string | undefined {
    const metadata = rootComponents.find(c => c.type === 'Metadata');
    if (metadata && metadata.data) {
      const meta = metadata.data as MetadataData;
      if (meta.key.toLowerCase() === 'author') {
        return meta.value;
      }
    }
    return undefined;
  }

  /**
   * Extract total pages from root components
   */
  private static extractTotalPages(rootComponents: DocumentComponent[]): number {
    const maxPage = Math.max(...rootComponents.map(c => c.position.sourcePage));
    return maxPage || 1;
  }

  /**
   * Calculate overall confidence
   */
  private static calculateOverallConfidence(questions: StructuredQuestion[]): number {
    if (questions.length === 0) return 0;
    
    const avgConfidence = questions.reduce((sum, q) => sum + q.confidence, 0) / questions.length;
    return Math.round(avgConfidence * 100) / 100;
  }

  /**
   * Generate warnings
   */
  private static generateWarnings(questions: StructuredQuestion[]): string[] {
    const warnings: string[] = [];
    
    for (const question of questions) {
      if (question.confidence < 0.8) {
        warnings.push(`Question has low confidence: ${question.confidence}`);
      }
      
      if (question.warnings && question.warnings.length > 0) {
        warnings.push(...question.warnings);
      }
    }
    
    return warnings;
  }
}
