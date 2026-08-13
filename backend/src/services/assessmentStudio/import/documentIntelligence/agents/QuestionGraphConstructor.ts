/**
 * Question Graph Constructor
 * Builds question-specific subgraphs from the document graph
 * Each question becomes a subgraph with its components (options, diagrams, tables, etc.)
 */

import { DocumentGraph } from '../DocumentGraph.js';
import { DocumentObject, ObjectType, QuestionObject } from '../types.js';

interface QuestionSubgraph {
  questionId: string;
  root: DocumentObject;
  components: {
    options: DocumentObject[];
    diagrams: DocumentObject[];
    tables: DocumentObject[];
    equations: DocumentObject[];
    codeBlocks: DocumentObject[];
    context: DocumentObject[];
    answer: DocumentObject | undefined;
  };
  relationships: Array<{
    from: string;
    to: string;
    type: string;
  }>;
  confidence: number;
}

export class QuestionGraphConstructor {
  private documentGraph: DocumentGraph;

  constructor(documentGraph: DocumentGraph) {
    this.documentGraph = documentGraph;
  }

  /**
   * Build question subgraphs for all questions in the document
   */
  buildQuestionSubgraphs(): Map<string, QuestionSubgraph> {
    console.log('[QuestionGraphConstructor] Building question subgraphs');

    const allNodes = this.documentGraph.getAllNodes();
    const tableNodes = this.documentGraph.getNodesByType('Table');
    const codeBlockNodes = this.documentGraph.getNodesByType('CodeBlock');
    

    const questionNodes = this.documentGraph.getNodesByType('Question');
    const subgraphs = new Map<string, QuestionSubgraph>();

    for (const questionNode of questionNodes) {
      const subgraph = this.buildQuestionSubgraph(questionNode);
      subgraphs.set(questionNode.id, subgraph);
    }

    console.log(`[QuestionGraphConstructor] Built ${subgraphs.size} question subgraphs`);
    return subgraphs;
  }

  /**
   * Build a single question subgraph
   */
  private buildQuestionSubgraph(questionNode: DocumentObject): QuestionSubgraph {
    const allNodes = this.documentGraph.getAllNodes();
    const questionIndex = allNodes.findIndex(n => n.id === questionNode.id);


    // Collect components
    const options = this.collectFollowingNodes(questionNode, allNodes, 'Option', 10);
    const diagrams = this.collectSectionBasedNodes(questionNode, allNodes, ['Image', 'Diagram']);
    const tables = this.collectSectionBasedNodes(questionNode, allNodes, ['Table']);
    const equations = this.collectSectionBasedNodes(questionNode, allNodes, ['Equation']);
    const codeBlocks = this.collectSectionBasedNodes(questionNode, allNodes, ['CodeBlock']);
    const context = this.collectPrecedingNodes(questionNode, allNodes, 'Paragraph', 5);
    const answer = this.findAnswerNode(questionNode, allNodes);


    // Build relationships
    const relationships = this.buildRelationships(questionNode, {
      options,
      diagrams,
      tables,
      equations,
      codeBlocks,
      context,
      answer,
    });

    // Calculate confidence
    const confidence = this.calculateSubgraphConfidence({
      options,
      diagrams,
      tables,
      equations,
      codeBlocks,
      context,
      answer,
    });

    return {
      questionId: questionNode.id,
      root: questionNode,
      components: {
        options,
        diagrams,
        tables,
        equations,
        codeBlocks,
        context,
        answer,
      },
      relationships,
      confidence,
    };
  }

  /**
   * Collect nodes that follow the question (for options, etc.)
   */
  private collectFollowingNodes(
    questionNode: DocumentObject,
    allNodes: DocumentObject[],
    type: ObjectType,
    maxCount: number
  ): DocumentObject[] {
    const collected: DocumentObject[] = [];
    const questionIndex = allNodes.findIndex(n => n.id === questionNode.id);

    for (let i = questionIndex + 1; i < Math.min(questionIndex + maxCount + 10, allNodes.length); i++) {
      const node = allNodes[i];

      if (node.type === type) {
        collected.push(node);
      } else if (node.type === 'Question') {
        // Stop if we hit another question
        break;
      }
    }

    return collected;
  }

  /**
   * Collect nodes within the same section as the question
   * Uses heading-based section boundaries: each question owns rich content between its heading and the next heading
   * Matches questions to headings by order (first Question node gets first "Question X" heading, etc.)
   */
  private collectSectionBasedNodes(
    questionNode: DocumentObject,
    allNodes: DocumentObject[],
    types: ObjectType[]
  ): DocumentObject[] {
    const collected: DocumentObject[] = [];
    const questionIndex = allNodes.findIndex(n => n.id === questionNode.id);
    if (questionIndex === -1) return collected;

    // Find all Question nodes and all "Question X" or "Section X" headings
    const questionIndices: number[] = [];
    const questionHeadingIndices: number[] = [];
    
    for (let i = 0; i < allNodes.length; i++) {
      if (allNodes[i].type === 'Question') {
        questionIndices.push(i);
      } else if (allNodes[i].type === 'Heading' && (allNodes[i].content?.toLowerCase().includes('question') || allNodes[i].content?.toLowerCase().includes('section'))) {
        questionHeadingIndices.push(i);
      }
    }

    // Find which question this is (by order)
    const questionOrder = questionIndices.indexOf(questionIndex);
    if (questionOrder === -1) return collected;

    // Get the corresponding heading (same order)
    const questionHeadingIndex = questionOrder < questionHeadingIndices.length ? questionHeadingIndices[questionOrder] : -1;
    
    // Find the next heading after this question's heading (section boundary)
    let nextHeadingIndex = allNodes.length;
    if (questionHeadingIndex !== -1) {
      const headingOrder = questionHeadingIndices.indexOf(questionHeadingIndex);
      if (headingOrder !== -1 && headingOrder + 1 < questionHeadingIndices.length) {
        nextHeadingIndex = questionHeadingIndices[headingOrder + 1];
      }
    }

    // Collect rich content nodes between the question heading and the next heading
    if (questionHeadingIndex !== -1) {
      for (let i = questionHeadingIndex; i < nextHeadingIndex; i++) {
        const node = allNodes[i];
        if (types.includes(node.type)) {
          collected.push(node);
        }
        // Also collect numbered Paragraph nodes as potential list items
        if (node.type === 'Paragraph' && /^\s*\d+\.\s+/.test(node.content || '')) {
          collected.push(node);
        }
      }
    }

    return collected;
  }

  /**
   * Collect nodes near the question (for diagrams, tables, etc.)
   */
  private collectNearbyNodes(
    questionNode: DocumentObject,
    allNodes: DocumentObject[],
    types: ObjectType[],
    range: number
  ): DocumentObject[] {
    const collected: DocumentObject[] = [];
    const questionIndex = allNodes.findIndex(n => n.id === questionNode.id);
    if (questionIndex === -1) return collected;

    const qPage = questionNode.page || questionNode.bbox?.page;

    // Search backwards up to range, stopping only at Section boundaries
    // Don't stop at Question nodes since rich content appears before Question nodes
    for (let i = questionIndex - 1; i >= Math.max(0, questionIndex - range); i--) {
      const node = allNodes[i];
      if (node.type === 'Section') break; // Stop at section boundaries only
      const nPage = node.page || node.bbox?.page;
      if (types.includes(node.type) && (!qPage || !nPage || nPage === qPage)) {
        collected.unshift(node);
      }
    }

    // Search forwards up to range, stopping only at Section boundaries
    for (let i = questionIndex + 1; i < Math.min(allNodes.length, questionIndex + range + 1); i++) {
      const node = allNodes[i];
      if (node.type === 'Section') break; // Stop at section boundaries only
      const nPage = node.page || node.bbox?.page;
      if (types.includes(node.type) && (!qPage || !nPage || nPage === qPage)) {
        collected.push(node);
      }
    }

    return collected;
  }

  /**
   * Collect nodes that precede the question (for context)
   */
  private collectPrecedingNodes(
    questionNode: DocumentObject,
    allNodes: DocumentObject[],
    type: ObjectType,
    maxCount: number
  ): DocumentObject[] {
    const collected: DocumentObject[] = [];
    const questionIndex = allNodes.findIndex(n => n.id === questionNode.id);

    for (let i = Math.max(0, questionIndex - maxCount); i < questionIndex; i++) {
      const node = allNodes[i];
      if (node.type === type) {
        collected.unshift(node); // Add in reverse order to maintain sequence
      }
    }

    return collected;
  }

  /**
   * Find answer node for a question
   */
  private findAnswerNode(
    questionNode: DocumentObject,
    allNodes: DocumentObject[]
  ): DocumentObject | undefined {
    const questionIndex = allNodes.findIndex(n => n.id === questionNode.id);

    // Look for answer key nodes after the question
    for (let i = questionIndex + 1; i < Math.min(questionIndex + 20, allNodes.length); i++) {
      const node = allNodes[i];
      if (node.type === 'AnswerKey') {
        return node;
      }
    }

    return undefined;
  }

  /**
   * Build relationships between question and its components
   */
  private buildRelationships(
    questionNode: DocumentObject,
    components: {
      options: DocumentObject[];
      diagrams: DocumentObject[];
      tables: DocumentObject[];
      equations: DocumentObject[];
      codeBlocks: DocumentObject[];
      context: DocumentObject[];
      answer: DocumentObject | undefined;
    }
  ): Array<{ from: string; to: string; type: string }> {
    const relationships: Array<{ from: string; to: string; type: string }> = [];

    // Question contains options
    for (const option of components.options) {
      relationships.push({ from: questionNode.id, to: option.id, type: 'contains' });
    }

    // Question illustrates diagrams
    for (const diagram of components.diagrams) {
      relationships.push({ from: questionNode.id, to: diagram.id, type: 'illustrates' });
    }

    // Question references tables
    for (const table of components.tables) {
      relationships.push({ from: questionNode.id, to: table.id, type: 'references' });
    }

    // Question contains equations
    for (const equation of components.equations) {
      relationships.push({ from: questionNode.id, to: equation.id, type: 'contains' });
    }

    // Question contains code blocks
    for (const codeBlock of components.codeBlocks) {
      relationships.push({ from: questionNode.id, to: codeBlock.id, type: 'contains' });
    }

    // Context provides context for question
    for (const contextNode of components.context) {
      relationships.push({ from: contextNode.id, to: questionNode.id, type: 'context_for' });
    }

    // Answer answers question
    if (components.answer) {
      relationships.push({ from: components.answer.id, to: questionNode.id, type: 'answers' });
    }

    return relationships;
  }

  /**
   * Calculate confidence for the subgraph
   */
  private calculateSubgraphConfidence(components: {
    options: DocumentObject[];
    diagrams: DocumentObject[];
    tables: DocumentObject[];
    equations: DocumentObject[];
    codeBlocks: DocumentObject[];
    context: DocumentObject[];
    answer: DocumentObject | undefined;
  }): number {
    let confidence = 0.5; // Base confidence

    // More components = higher confidence
    if (components.options.length > 0) confidence += 0.1;
    if (components.context.length > 0) confidence += 0.1;
    if (components.answer) confidence += 0.15;

    // Complex elements increase confidence
    if (components.diagrams.length > 0) confidence += 0.05;
    if (components.tables.length > 0) confidence += 0.05;
    if (components.equations.length > 0) confidence += 0.05;
    if (components.codeBlocks.length > 0) confidence += 0.05;

    return Math.min(confidence, 0.95);
  }

  /**
   * Convert question subgraph to Question Object
   */
  subgraphToQuestionObject(subgraph: QuestionSubgraph): QuestionObject {
    const { root, components } = subgraph;

    return {
      id: root.id,
      sourcePage: root.page,
      bbox: root.bbox,
      statement: root.content || '',
      context: {
        paragraphs: components.context.map(n => n.content || ''),
        diagrams: components.diagrams.map(n => ({
          id: n.id,
          bbox: n.bbox,
          type: 'diagram',
          caption: n.content,
          confidence: n.confidence,
        })),
        tables: components.tables.map(n => ({
          id: n.id,
          bbox: n.bbox,
          rows: 0,
          cols: 0,
          headers: [],
          cells: [],
          confidence: n.confidence,
        })),
      },
      options: components.options.map(n => ({
        id: n.id,
        marker: this.extractOptionMarker(n.content || ''),
        text: n.content || '',
        isCorrect: false,
        confidence: n.confidence,
        bbox: n.bbox,
      })),
      diagram: components.diagrams.length > 0 ? {
        id: components.diagrams[0].id,
        bbox: components.diagrams[0].bbox,
        type: 'diagram',
        caption: components.diagrams[0].content,
        confidence: components.diagrams[0].confidence,
      } : undefined,
      table: components.tables.length > 0 ? {
        id: components.tables[0].id,
        bbox: components.tables[0].bbox,
        rows: 0,
        cols: 0,
        headers: [],
        cells: [],
        confidence: components.tables[0].confidence,
      } : undefined,
      equations: components.equations.map(n => ({
        id: n.id,
        content: n.content || '',
        format: 'unicode',
        type: 'inline',
        bbox: n.bbox,
        confidence: n.confidence,
      })),
      code: components.codeBlocks.length > 0 ? components.codeBlocks.map(n => ({
        id: n.id,
        content: n.content || '',
        language: 'unknown',
        bbox: n.bbox,
        indentation: 0,
        confidence: n.confidence,
      })) : undefined,
      correctAnswer: components.answer?.content || '',
      answerLocation: components.answer ? 'inferred' : 'inferred',
      type: 'multiple_choice', // Placeholder
      metadata: {
        difficulty: 'medium',
        topic: 'General',
        subtopic: '',
        marks: undefined,
        bloomLevel: 'L2',
        skills: [],
        sourcePage: root.page,
        bbox: root.bbox,
      },
      confidence: {
        ocr: root.confidence,
        layout: 0.85,
        questionBoundary: 0.9,
        options: components.options.length > 0 ? 0.85 : 0.5,
        answer: components.answer ? 0.7 : 0.3,
        semantic: 0.8,
        overall: subgraph.confidence,
      },
      validation: {
        isValid: true,
        issues: [],
        warnings: [],
      },
      repairHistory: [],
      reasoning: {
        decision: `Built from subgraph with ${components.options.length} options`,
        confidence: subgraph.confidence,
        evidence: [
          { type: 'semantic_intent', value: root.content, confidence: 0.8 },
          { type: 'option_pattern', value: components.options.length, confidence: 0.9 },
        ],
        alternatives: [],
      },
    };
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
   * Get statistics
   */
  getStatistics(): {
    totalQuestions: number;
    averageComponents: number;
    averageConfidence: number;
  } {
    const subgraphs = this.buildQuestionSubgraphs();
    const totalQuestions = subgraphs.size;

    let totalComponents = 0;
    let totalConfidence = 0;

    for (const subgraph of subgraphs.values()) {
      totalComponents += subgraph.components.options.length +
                         subgraph.components.diagrams.length +
                         subgraph.components.tables.length +
                         subgraph.components.equations.length +
                         subgraph.components.codeBlocks.length;
      totalConfidence += subgraph.confidence;
    }

    return {
      totalQuestions,
      averageComponents: totalQuestions > 0 ? totalComponents / totalQuestions : 0,
      averageConfidence: totalQuestions > 0 ? totalConfidence / totalQuestions : 0,
    };
  }
}
