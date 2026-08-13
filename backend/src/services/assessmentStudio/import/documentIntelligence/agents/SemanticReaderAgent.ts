/**
 * Semantic Reader Agent
 * Specializes in semantic classification of document nodes
 * Classifies nodes as: Instruction, Heading, Question, Option, Paragraph, Answer
 */

import { BaseAgent } from './BaseAgent.js';
import { AgentInput, AgentOutput, DocumentObject, ObjectType } from '../types.js';

interface SemanticClassificationResult {
  classifications: Map<string, ObjectType>;
  confidence: number;
  uncertainNodes: Array<{ id: string; currentType: ObjectType; suggestedTypes: ObjectType[] }>;
}

export class SemanticReaderAgent extends BaseAgent {
  constructor() {
    super({
      name: 'SemanticReader',
      version: '1.0.0',
      capabilities: [
        'semantic_classification',
        'context_aware_classification',
        'heading_detection',
        'question_detection',
        'option_detection',
        'instruction_detection',
        'answer_detection',
      ],
      maxRetries: 3,
      timeout: 30000,
    });
  }

  /**
   * Process semantic classification
   */
  protected async process(input: AgentInput): Promise<SemanticClassificationResult> {
    this.log('Starting semantic classification');

    const nodes = this.documentGraph.nodes;
    const allNodes = Array.from(nodes.values());

    const classifications = new Map<string, ObjectType>();
    const uncertainNodes: Array<{ id: string; currentType: ObjectType; suggestedTypes: ObjectType[] }> = [];

    // Classify each node
    for (const node of allNodes) {
      // Do not overwrite existing structured types (Question, Table, CodeBlock, Equation, List, Image)
      if (['Question', 'Table', 'CodeBlock', 'Equation', 'List', 'Image', 'Diagram'].includes(node.type)) {
        classifications.set(node.id, node.type);
        continue;
      }

      const classification = this.classifyNode(node, allNodes);
      classifications.set(node.id, classification.type);

      if (classification.confidence < 0.7) {
        uncertainNodes.push({
          id: node.id,
          currentType: classification.type,
          suggestedTypes: classification.alternatives,
        });
      }

      // Update node type in graph
      node.type = classification.type;
      node.confidence = classification.confidence;
    }

    // Post-process to refine classifications based on context
    this.refineClassificationsWithContext(allNodes, classifications);

    // Calculate overall confidence
    const confidence = this.calculateConfidence({
      classifications,
      uncertainNodes,
      confidence: 0,
    });

    this.log(`Classified ${classifications.size} nodes with ${uncertainNodes.length} uncertain`);

    return {
      classifications,
      confidence,
      uncertainNodes,
    };
  }

  /**
   * Calculate confidence for semantic classification
   */
  protected calculateConfidence(result: SemanticClassificationResult): number {
    const totalNodes = result.classifications.size;
    const uncertainNodes = result.uncertainNodes.length;

    if (totalNodes === 0) return 0;

    const certaintyRatio = (totalNodes - uncertainNodes) / totalNodes;
    return certaintyRatio * 0.9 + 0.1; // Base confidence of 0.1
  }

  /**
   * Classify a single node
   */
  private classifyNode(
    node: DocumentObject,
    allNodes: DocumentObject[]
  ): { type: ObjectType; confidence: number; alternatives: ObjectType[] } {
    const content = node.content || '';
    const lowerContent = content.toLowerCase();

    // Get context (surrounding nodes)
    const context = this.getNodeContext(node, allNodes);

    // Check for question patterns
    const questionResult = this.checkQuestionPatterns(content, lowerContent, context);
    if (questionResult.confidence > 0.8) {
      return questionResult;
    }

    // Check for heading patterns
    const headingResult = this.checkHeadingPatterns(content, lowerContent, context, node);
    if (headingResult.confidence > 0.8) {
      return headingResult;
    }

    // Check for instruction patterns
    const instructionResult = this.checkInstructionPatterns(content, lowerContent, context);
    if (instructionResult.confidence > 0.8) {
      return instructionResult;
    }

    // Check for option patterns
    const optionResult = this.checkOptionPatterns(content, lowerContent, context);
    if (optionResult.confidence > 0.8) {
      return optionResult;
    }

    // Check for answer patterns
    const answerResult = this.checkAnswerPatterns(content, lowerContent, context);
    if (answerResult.confidence > 0.8) {
      return answerResult;
    }

    // Default to paragraph
    return {
      type: 'Paragraph',
      confidence: 0.6,
      alternatives: ['Heading', 'Question'],
    };
  }

  /**
   * Get context for a node (surrounding nodes)
   */
  private getNodeContext(node: DocumentObject, allNodes: DocumentObject[]): {
    previous: DocumentObject[];
    next: DocumentObject[];
    parent: DocumentObject | undefined;
  } {
    const nodeIndex = allNodes.findIndex(n => n.id === node.id);

    const previous = allNodes.slice(Math.max(0, nodeIndex - 3), nodeIndex);
    const next = allNodes.slice(nodeIndex + 1, Math.min(allNodes.length, nodeIndex + 4));

    const parent = node.parent ? allNodes.find(n => n.id === node.parent) : undefined;

    return { previous, next, parent };
  }

  /**
   * Check for question patterns
   */
  private checkQuestionPatterns(
    content: string,
    lowerContent: string,
    context: { previous: DocumentObject[]; next: DocumentObject[]; parent: DocumentObject | undefined }
  ): { type: ObjectType; confidence: number; alternatives: ObjectType[] } {
    let confidence = 0;
    const alternatives: ObjectType[] = [];

    // Question words
    const questionWords = ['what', 'which', 'who', 'when', 'where', 'why', 'how', 'which of the following'];
    if (questionWords.some(word => lowerContent.startsWith(word))) {
      confidence += 0.4;
    }

    // Question mark
    if (content.includes('?')) {
      confidence += 0.3;
    }

    // Numbering
    if (/^(\d+[\.\)]\s+|Q\d+[:\.\)]\s+|Question\s+\d+[:\.\)]\s+)/i.test(content)) {
      confidence += 0.4;
    }

    // Context: previous node is heading or instruction
    if (context.previous.length > 0) {
      const prevType = context.previous[context.previous.length - 1].type;
      if (prevType === 'Heading' || prevType === 'Instruction') {
        confidence += 0.2;
      }
    }

    // Context: next nodes look like options
    if (context.next.length > 0) {
      const nextContent = context.next[0].content || '';
      if (/^[a-e][\.\)]\s+/i.test(nextContent)) {
        confidence += 0.3;
        alternatives.push('Option');
      }
    }

    // Cap confidence
    confidence = Math.min(confidence, 0.95);

    if (confidence > 0.5) {
      return { type: 'Question', confidence, alternatives };
    }

    return { type: 'Paragraph', confidence: 0.3, alternatives: ['Question'] };
  }

  /**
   * Check for heading patterns
   */
  private checkHeadingPatterns(
    content: string,
    lowerContent: string,
    context: { previous: DocumentObject[]; next: DocumentObject[]; parent: DocumentObject | undefined },
    node: DocumentObject
  ): { type: ObjectType; confidence: number; alternatives: ObjectType[] } {
    let confidence = 0;
    const alternatives: ObjectType[] = [];

    // All caps and short
    if (content === content.toUpperCase() && content.length < 50 && content.length > 3) {
      confidence += 0.5;
    }

    // Very early in document
    if (node.page === 1 && content.length < 30) {
      confidence += 0.3;
    }

    // Contains section keywords
    const sectionKeywords = ['chapter', 'section', 'part', 'unit', 'module'];
    if (sectionKeywords.some(keyword => lowerContent.includes(keyword))) {
      confidence += 0.4;
    }

    // Short and no ending punctuation
    if (content.length < 50 && !content.endsWith('.')) {
      confidence += 0.2;
    }

    // Context: followed by content nodes
    if (context.next.length > 0) {
      const nextType = context.next[0].type;
      if (nextType === 'Paragraph' || nextType === 'Question') {
        confidence += 0.2;
      }
    }

    // Cap confidence
    confidence = Math.min(confidence, 0.95);

    if (confidence > 0.5) {
      return { type: 'Heading', confidence, alternatives };
    }

    return { type: 'Paragraph', confidence: 0.3, alternatives: ['Heading'] };
  }

  /**
   * Check for instruction patterns
   */
  private checkInstructionPatterns(
    content: string,
    lowerContent: string,
    context: { previous: DocumentObject[]; next: DocumentObject[]; parent: DocumentObject | undefined }
  ): { type: ObjectType; confidence: number; alternatives: ObjectType[] } {
    let confidence = 0;
    const alternatives: ObjectType[] = [];

    // Instruction keywords
    const instructionKeywords = [
      'instructions',
      'directions',
      'read the following',
      'answer all questions',
      'choose the correct answer',
      'select all that apply',
      'fill in the blanks',
      'match the following',
    ];

    if (instructionKeywords.some(keyword => lowerContent.includes(keyword))) {
      confidence += 0.6;
    }

    // Imperative verbs
    const imperativeVerbs = ['answer', 'select', 'choose', 'fill', 'match', 'complete', 'write'];
    if (imperativeVerbs.some(verb => lowerContent.startsWith(verb))) {
      confidence += 0.3;
    }

    // Context: followed by questions
    if (context.next.length > 0) {
      const nextType = context.next[0].type;
      if (nextType === 'Question') {
        confidence += 0.2;
      }
    }

    // Cap confidence
    confidence = Math.min(confidence, 0.95);

    if (confidence > 0.5) {
      return { type: 'Instruction', confidence, alternatives };
    }

    return { type: 'Paragraph', confidence: 0.3, alternatives: ['Instruction'] };
  }

  /**
   * Check for option patterns
   */
  private checkOptionPatterns(
    content: string,
    lowerContent: string,
    context: { previous: DocumentObject[]; next: DocumentObject[]; parent: DocumentObject | undefined }
  ): { type: ObjectType; confidence: number; alternatives: ObjectType[] } {
    let confidence = 0;
    const alternatives: ObjectType[] = [];

    // Option markers
    if (/^[a-e][\.\)]\s+/i.test(content)) {
      confidence += 0.5;
    }

    if (/^\(\s*[a-e]\s*\)\s+/i.test(content)) {
      confidence += 0.5;
    }

    if (/^\d+[\.\)]\s+/.test(content)) {
      confidence += 0.4;
    }

    // Short content
    if (content.length < 100) {
      confidence += 0.2;
    }

    // Context: previous node is question
    if (context.previous.length > 0) {
      const prevType = context.previous[context.previous.length - 1].type;
      if (prevType === 'Question') {
        confidence += 0.3;
      }
    }

    // Cap confidence
    confidence = Math.min(confidence, 0.95);

    if (confidence > 0.5) {
      return { type: 'Option', confidence, alternatives };
    }

    return { type: 'Paragraph', confidence: 0.3, alternatives: ['Option'] };
  }

  /**
   * Check for answer patterns
   */
  private checkAnswerPatterns(
    content: string,
    lowerContent: string,
    context: { previous: DocumentObject[]; next: DocumentObject[]; parent: DocumentObject | undefined }
  ): { type: ObjectType; confidence: number; alternatives: ObjectType[] } {
    let confidence = 0;
    const alternatives: ObjectType[] = [];

    // Answer keywords
    const answerKeywords = ['answer', 'correct answer', 'solution', 'key', 'explanation'];
    if (answerKeywords.some(keyword => lowerContent.startsWith(keyword))) {
      confidence += 0.6;
    }

    // Checkmark or correct marker
    if (content.includes('✅') || content.includes('✔') || content.includes('[correct]')) {
      confidence += 0.5;
    }

    // Context: after questions
    if (context.previous.length > 0) {
      const prevType = context.previous[context.previous.length - 1].type;
      if (prevType === 'Question' || prevType === 'Option') {
        confidence += 0.2;
      }
    }

    // Cap confidence
    confidence = Math.min(confidence, 0.95);

    if (confidence > 0.5) {
      return { type: 'AnswerKey', confidence, alternatives };
    }

    return { type: 'Paragraph', confidence: 0.3, alternatives: ['AnswerKey'] };
  }

  /**
   * Refine classifications based on context
   */
  private refineClassificationsWithContext(
    allNodes: DocumentObject[],
    classifications: Map<string, ObjectType>
  ): void {
    // Refine options: ensure they follow questions
    for (let i = 1; i < allNodes.length; i++) {
      const current = allNodes[i];
      const previous = allNodes[i - 1];

      if (classifications.get(current.id) === 'Option' && classifications.get(previous.id) !== 'Question') {
        // If an option doesn't follow a question, it might be something else
        // Check if it could be a list item
        if (current.content && /^[a-e][\.\)]\s+/i.test(current.content)) {
          // Keep as option, might be part of a question set
        } else {
          // Change to paragraph
          classifications.set(current.id, 'Paragraph');
          current.type = 'Paragraph';
        }
      }
    }

    // Refine headings: ensure they're not too long
    for (const node of allNodes) {
      if (classifications.get(node.id) === 'Heading' && node.content && node.content.length > 100) {
        // Too long for a heading, change to paragraph
        classifications.set(node.id, 'Paragraph');
        node.type = 'Paragraph';
      }
    }

    this.log('Refined classifications based on context');
  }
}
