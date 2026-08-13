/**
 * Repair Agent
 * Fixes issues found during validation
 * Searches the graph to find missing content and repairs detected problems
 */

import { BaseAgent } from './BaseAgent.js';
import { AgentInput, AgentOutput, QuestionObject, RepairOperation, DocumentObject } from '../types.js';

interface RepairAgentResult {
  repairedQuestions: QuestionObject[];
  repairs: RepairOperation[];
  confidence: number;
  statistics: {
    totalRepairs: number;
    successfulRepairs: number;
    failedRepairs: number;
    repairsByType: Record<string, number>;
  };
}

export class RepairAgent extends BaseAgent {
  constructor() {
    super({
      name: 'Repair',
      version: '1.0.0',
      capabilities: [
        'missing_question_repair',
        'merged_question_repair',
        'split_question_repair',
        'missing_option_repair',
        'wrong_answer_repair',
        'metadata_repair',
        'graph_search',
      ],
      maxRetries: 3,
      timeout: 30000,
    });
  }

  /**
   * Process repair
   */
  protected async process(input: AgentInput): Promise<RepairAgentResult> {
    this.log('Starting repair');

    // Get questions and validation result from previous agents
    const questions = this.extractQuestions(input);
    const validationResult = this.extractValidationResult(input);

    this.log(`Repairing ${questions.length} questions with ${validationResult?.issues?.length || 0} issues`);

    const repairs: RepairOperation[] = [];
    const repairsByType: Record<string, number> = {};
    let successfulRepairs = 0;
    let failedRepairs = 0;

    // Clone questions to avoid modifying originals
    const repairedQuestions = questions.map(q => ({ ...q }));

    // Get document nodes for searching
    const allNodes = this.documentGraph.nodes;
    const documentNodes = Array.from(allNodes.values());

    // Process each issue
    if (validationResult?.issues) {
      for (const issue of validationResult.issues) {
        const repairResult = await this.repairIssue(
          issue,
          repairedQuestions,
          documentNodes,
          repairs
        );

        if (repairResult.success) {
          successfulRepairs++;
          repairsByType[issue.type] = (repairsByType[issue.type] || 0) + 1;
        } else {
          failedRepairs++;
        }
      }
    }

    this.log(`Repair complete: ${successfulRepairs} successful, ${failedRepairs} failed`);

    // Build result with statistics
    const result: RepairAgentResult = {
      repairedQuestions,
      repairs,
      confidence: 0, // Will calculate below
      statistics: {
        totalRepairs: repairs.length,
        successfulRepairs,
        failedRepairs,
        repairsByType,
      },
    };

    // Calculate confidence
    result.confidence = this.calculateConfidence(result);

    return result;
  }

  /**
   * Calculate confidence for repair
   */
  protected calculateConfidence(result: RepairAgentResult): number {
    if (result.repairs.length === 0) {
      return 1.0; // No repairs needed, perfect confidence
    }

    const successRate = result.statistics.successfulRepairs / result.statistics.totalRepairs;
    return successRate * 0.9 + 0.1; // Base confidence of 0.1
  }

  /**
   * Extract questions from input
   */
  private extractQuestions(input: AgentInput): QuestionObject[] {
    if (input.config?.previousAgentResult?.result?.questions) {
      return input.config.previousAgentResult.result.questions;
    }
    if (input.config?.previousAgentResult?.result?.reasonedQuestions) {
      return input.config.previousAgentResult.result.reasonedQuestions;
    }
    return [];
  }

  /**
   * Extract validation result from input
   */
  private extractValidationResult(input: AgentInput): any {
    // Look for validator result in dependency results
    if (input.config?.dependencyResults) {
      for (const depResult of input.config.dependencyResults) {
        if (depResult.result?.validationResult) {
          return depResult.result;
        }
      }
    }
    return null;
  }

  /**
   * Repair a specific issue
   */
  private async repairIssue(
    issue: any,
    questions: QuestionObject[],
    documentNodes: DocumentObject[],
    repairs: RepairOperation[]
  ): Promise<{ success: boolean; repair?: RepairOperation }> {
    const timestamp = new Date();

    switch (issue.type) {
      case 'omission':
        return this.repairOmission(issue, questions, documentNodes, repairs, timestamp);

      case 'boundary':
        return this.repairBoundary(issue, questions, documentNodes, repairs, timestamp);

      case 'content':
        return this.repairContent(issue, questions, documentNodes, repairs, timestamp);

      case 'structure':
        return this.repairStructure(issue, questions, repairs, timestamp);

      case 'confidence':
        return this.repairConfidence(issue, questions, repairs, timestamp);

      default:
        return { success: false };
    }
  }

  /**
   * Repair omission (missing questions)
   */
  private async repairOmission(
    issue: any,
    questions: QuestionObject[],
    documentNodes: DocumentObject[],
    repairs: RepairOperation[],
    timestamp: Date
  ): Promise<{ success: boolean; repair?: RepairOperation }> {
    this.log(`Repairing omission: ${issue.description}`);

    // Find question nodes that weren't extracted
    const extractedIds = new Set(questions.map(q => q.id));
    const missingQuestionNodes = documentNodes.filter(
      n => n.type === 'Question' && !extractedIds.has(n.id)
    );

    if (missingQuestionNodes.length === 0) {
      return { success: false };
    }

    // Extract missing questions
    let addedCount = 0;
    for (const node of missingQuestionNodes) {
      const newQuestion = this.createQuestionFromNode(node, documentNodes);
      questions.push(newQuestion);
      addedCount++;

      repairs.push({
        timestamp,
        type: 'add_question',
        description: `Added missing question ${node.id}`,
        before: null,
        after: newQuestion,
        agent: this.config.name,
      });
    }

    this.log(`Added ${addedCount} missing questions`);

    return {
      success: true,
      repair: repairs[repairs.length - 1],
    };
  }

  /**
   * Repair boundary issues
   */
  private async repairBoundary(
    issue: any,
    questions: QuestionObject[],
    documentNodes: DocumentObject[],
    repairs: RepairOperation[],
    timestamp: Date
  ): Promise<{ success: boolean; repair?: RepairOperation }> {
    this.log(`Repairing boundary: ${issue.description}`);

    const question = questions.find(q => q.id === issue.questionId);
    if (!question) {
      return { success: false };
    }

    const questionNode = documentNodes.find(n => n.id === question.id);
    if (!questionNode) {
      return { success: false };
    }

    // Repair based on specific issue
    let repaired = false;

    if (issue.issue.includes('too short')) {
      // Try to get more content from document node
      if (questionNode.content && questionNode.content.length > question.statement.length) {
        const before = question.statement;
        question.statement = questionNode.content;
        repaired = true;

        repairs.push({
          timestamp,
          type: 'fix_statement',
          description: `Extended statement for question ${question.id}`,
          before,
          after: question.statement,
          agent: this.config.name,
        });
      }
    }

    if (issue.issue.includes('insufficient options')) {
      // Try to find more options in document
      const additionalOptions = this.findAdditionalOptions(question, documentNodes);
      if (additionalOptions.length > 0) {
        const before = question.options?.length || 0;
        question.options = [...(question.options || []), ...additionalOptions];
        repaired = true;

        repairs.push({
          timestamp,
          type: 'add_options',
          description: `Added ${additionalOptions.length} options to question ${question.id}`,
          before,
          after: question.options?.length,
          agent: this.config.name,
        });
      }
    }

    if (repaired) {
      // Update confidence
      question.confidence.questionBoundary = Math.min(question.confidence.questionBoundary + 0.1, 1.0);
      question.confidence.overall = this.calculateQuestionConfidence(question);
    }

    return {
      success: repaired,
      repair: repaired ? repairs[repairs.length - 1] : undefined,
    };
  }

  /**
   * Repair content issues
   */
  private async repairContent(
    issue: any,
    questions: QuestionObject[],
    documentNodes: DocumentObject[],
    repairs: RepairOperation[],
    timestamp: Date
  ): Promise<{ success: boolean; repair?: RepairOperation }> {
    this.log(`Repairing content: ${issue.description}`);

    // Content repairs are complex - for now, flag for manual review
    repairs.push({
      timestamp,
      type: 'flag_for_review',
      description: `Content issue flagged for manual review: ${issue.description}`,
      agent: this.config.name,
    });

    return { success: false }; // Not auto-repaired
  }

  /**
   * Repair structure issues
   */
  private async repairStructure(
    issue: any,
    questions: QuestionObject[],
    repairs: RepairOperation[],
    timestamp: Date
  ): Promise<{ success: boolean; repair?: RepairOperation }> {
    this.log(`Repairing structure: ${issue.description}`);

    const question = questions.find(q => q.id === issue.questionId);
    if (!question) {
      return { success: false };
    }

    let repaired = false;

    if (issue.issue.includes('Invalid question type')) {
      // Default to multiple_choice
      const before = question.type;
      question.type = 'multiple_choice';
      repaired = true;

      repairs.push({
        timestamp,
        type: 'fix_type',
        description: `Fixed type for question ${question.id}`,
        before,
        after: question.type,
        agent: this.config.name,
      });
    }

    if (issue.issue.includes('Invalid or missing difficulty')) {
      const before = question.metadata.difficulty;
      question.metadata.difficulty = 'medium';
      repaired = true;

      repairs.push({
        timestamp,
        type: 'fix_difficulty',
        description: `Set default difficulty for question ${question.id}`,
        before,
        after: question.metadata.difficulty,
        agent: this.config.name,
      });
    }

    if (repaired) {
      question.validation.isValid = true;
      question.validation.issues = question.validation.issues.filter(i => i !== issue.issue);
    }

    return {
      success: repaired,
      repair: repaired ? repairs[repairs.length - 1] : undefined,
    };
  }

  /**
   * Repair confidence issues
   */
  private async repairConfidence(
    issue: any,
    questions: QuestionObject[],
    repairs: RepairOperation[],
    timestamp: Date
  ): Promise<{ success: boolean; repair?: RepairOperation }> {
    this.log(`Repairing confidence: ${issue.description}`);

    const question = questions.find(q => q.id === issue.questionId);
    if (!question) {
      return { success: false };
    }

    // Flag low confidence questions for review
    question.validation.warnings.push('Low confidence - manual review recommended');

    repairs.push({
      timestamp,
      type: 'flag_low_confidence',
      description: `Flagged low confidence question ${question.id} for review`,
      agent: this.config.name,
    });

    return { success: true };
  }

  /**
   * Create a question from a document node
   */
  private createQuestionFromNode(node: DocumentObject, documentNodes: DocumentObject[]): QuestionObject {
    const questionIndex = documentNodes.findIndex(n => n.id === node.id);

    // Collect nearby options
    const options: any[] = [];
    for (let i = questionIndex + 1; i < Math.min(questionIndex + 10, documentNodes.length); i++) {
      const nextNode = documentNodes[i];
      if (nextNode.type === 'Option') {
        options.push({
          id: nextNode.id,
          marker: this.extractOptionMarker(nextNode.content || ''),
          text: nextNode.content || '',
          isCorrect: false,
          confidence: nextNode.confidence,
          bbox: nextNode.bbox,
        });
      } else if (nextNode.type === 'Question') {
        break;
      }
    }

    return {
      id: node.id,
      sourcePage: node.page,
      bbox: node.bbox,
      statement: node.content || '',
      context: {
        paragraphs: [],
        diagrams: [],
        tables: [],
      },
      options: options.length > 0 ? options : undefined,
      correctAnswer: '',
      answerLocation: 'inferred',
      type: options.length > 0 ? 'multiple_choice' : 'short_answer',
      metadata: {
        difficulty: 'medium',
        topic: this.workingMemory.context.currentSection || 'General',
        subtopic: '',
        marks: undefined,
        bloomLevel: 'L2',
        skills: [],
        sourcePage: node.page,
        bbox: node.bbox,
      },
      confidence: {
        ocr: node.confidence,
        layout: 0.85,
        questionBoundary: 0.8,
        options: options.length > 0 ? 0.8 : 0.5,
        answer: 0.3,
        semantic: 0.7,
        overall: 0.7,
      },
      validation: {
        isValid: true,
        issues: [],
        warnings: [],
      },
      repairHistory: [],
      reasoning: {
        decision: 'Question added during repair',
        confidence: 0.7,
        evidence: [
          { type: 'semantic_intent', value: node.content, confidence: 0.7 },
          { type: 'option_pattern', value: options.length, confidence: 0.8 },
        ],
        alternatives: [],
      },
    };
  }

  /**
   * Find additional options for a question
   */
  private findAdditionalOptions(question: QuestionObject, documentNodes: DocumentObject[]): any[] {
    const questionNode = documentNodes.find(n => n.id === question.id);
    if (!questionNode) return [];

    const questionIndex = documentNodes.findIndex(n => n.id === question.id);
    const additionalOptions: any[] = [];

    // Search for more options after current options
    const currentOptionCount = question.options?.length || 0;
    for (let i = questionIndex + currentOptionCount + 1; i < Math.min(questionIndex + 15, documentNodes.length); i++) {
      const node = documentNodes[i];

      if (node.type === 'Option') {
        // Check if this option is already in the question
        const alreadyExists = question.options?.some(o => o.id === node.id);
        if (!alreadyExists) {
          additionalOptions.push({
            id: node.id,
            marker: this.extractOptionMarker(node.content || ''),
            text: node.content || '',
            isCorrect: false,
            confidence: node.confidence,
            bbox: node.bbox,
          });
        }
      } else if (node.type === 'Question') {
        break;
      }
    }

    return additionalOptions;
  }

  /**
   * Extract option marker from content
   */
  private extractOptionMarker(content: string): string {
    const match = content.match(/^([a-eA-E0-9])[\.\)]\s+/);
    return match ? match[1] : '';
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
}
