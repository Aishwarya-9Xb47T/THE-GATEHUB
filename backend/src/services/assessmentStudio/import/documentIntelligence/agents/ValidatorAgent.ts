/**
 * Validator Agent
 * Compares extraction with source document to detect omissions, mistakes, and hallucinations
 */

import { BaseAgent } from './BaseAgent.js';
import { AgentInput, AgentOutput, QuestionObject, ValidationResult, DocumentObject } from '../types.js';

interface ValidationAgentResult {
  validationResult: ValidationResult;
  confidence: number;
  issues: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high';
    description: string;
    questionId?: string;
  }>;
}

export class ValidatorAgent extends BaseAgent {
  constructor() {
    super({
      name: 'Validator',
      version: '1.0.0',
      capabilities: [
        'coverage_analysis',
        'boundary_validation',
        'content_validation',
        'structure_validation',
        'omission_detection',
        'hallucination_detection',
        'duplicate_detection',
      ],
      maxRetries: 3,
      timeout: 30000,
    });
  }

  /**
   * Process validation
   */
  protected async process(input: AgentInput): Promise<ValidationAgentResult> {
    this.log('Starting validation');

    // Get questions from previous agent result
    const questions = this.extractQuestions(input);
    this.log(`Validating ${questions.length} questions`);

    // Get document nodes for comparison
    const allNodes = this.documentGraph.nodes;
    const documentNodes = Array.from(allNodes.values());

    // Run validation checks
    const coverage = this.analyzeCoverage(questions, documentNodes);
    const boundaries = this.validateBoundaries(questions, documentNodes);
    const content = this.validateContent(questions, documentNodes);
    const structure = this.validateStructure(questions);

    // Detect issues
    const issues = this.detectIssues(questions, documentNodes, coverage, boundaries, content, structure);

    // Calculate overall validation
    const overall = this.calculateOverallValidation(coverage, boundaries, content, structure, issues);

    this.log('Validation complete');

    // Build result
    const result: ValidationAgentResult = {
      validationResult: {
        coverage,
        boundaries,
        content,
        structure,
        overall,
      },
      confidence: 0, // Will calculate below
      issues,
    };

    // Calculate confidence
    result.confidence = this.calculateConfidence(result);

    return result;
  }

  /**
   * Calculate confidence for validation
   */
  protected calculateConfidence(result: ValidationAgentResult): number {
    const overall = result.validationResult.overall;
    const issues = result.issues;

    if (!overall.isValid) {
      return 0.3; // Low confidence if validation failed
    }

    // Reduce confidence based on issue severity
    const highSeverityIssues = issues.filter(i => i.severity === 'high').length;
    const mediumSeverityIssues = issues.filter(i => i.severity === 'medium').length;

    let confidence = overall.confidence;
    confidence -= highSeverityIssues * 0.1;
    confidence -= mediumSeverityIssues * 0.05;

    return Math.max(confidence, 0);
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
   * Analyze coverage - what percentage of document was extracted
   */
  private analyzeCoverage(questions: QuestionObject[], documentNodes: DocumentObject[]): {
    totalQuestions: number;
    extractedQuestions: number;
    missingQuestions: number;
    extraQuestions: number;
    coveragePercentage: number;
  } {
    // Count question nodes in document
    const documentQuestionNodes = documentNodes.filter(n => n.type === 'Question');
    const totalQuestions = documentQuestionNodes.length;
    const extractedQuestions = questions.length;

    // Estimate missing questions (heuristic)
    const missingQuestions = Math.max(0, totalQuestions - extractedQuestions);

    // Extra questions (hallucinations)
    const extraQuestions = Math.max(0, extractedQuestions - totalQuestions);

    // Coverage percentage
    const coveragePercentage = totalQuestions > 0 ? (extractedQuestions / totalQuestions) * 100 : 0;

    this.log(`Coverage: ${coveragePercentage}% (${extractedQuestions}/${totalQuestions})`);

    return {
      totalQuestions,
      extractedQuestions,
      missingQuestions,
      extraQuestions,
      coveragePercentage,
    };
  }

  /**
   * Validate question boundaries
   */
  private validateBoundaries(questions: QuestionObject[], documentNodes: DocumentObject[]): {
    correct: number;
    incorrect: number;
    issues: Array<{ questionId: string; issue: string; severity: 'low' | 'medium' | 'high' }>;
  } {
    let correct = 0;
    let incorrect = 0;
    const issues: Array<{ questionId: string; issue: string; severity: 'low' | 'medium' | 'high' }> = [];

    for (const question of questions) {
      const questionNode = documentNodes.find(n => n.id === question.id);
      
      if (!questionNode) {
        // Question not found in document - could be hallucination
        incorrect++;
        issues.push({
          questionId: question.id,
          issue: 'Question node not found in document',
          severity: 'high',
        });
        continue;
      }

      // Check if question has reasonable statement length
      if (question.statement.length < 5) {
        incorrect++;
        issues.push({
          questionId: question.id,
          issue: 'Question statement too short',
          severity: 'high',
        });
        continue;
      }

      // Check if question has options for MCQ types
      if (['multiple_choice', 'multiple_select'].includes(question.type)) {
        if (!question.options || question.options.length < 2) {
          incorrect++;
          issues.push({
            questionId: question.id,
            issue: 'MCQ question has insufficient options',
            severity: 'high',
          });
          continue;
        }
      }

      // Check if true/false has exactly 2 options
      if (question.type === 'true_false') {
        if (!question.options || question.options.length !== 2) {
          incorrect++;
          issues.push({
            questionId: question.id,
            issue: 'True/false question must have exactly 2 options',
            severity: 'medium',
          });
          continue;
        }
      }

      correct++;
    }

    this.log(`Boundary validation: ${correct} correct, ${incorrect} incorrect`);

    return { correct, incorrect, issues };
  }

  /**
   * Validate content accuracy
   */
  private validateContent(questions: QuestionObject[], documentNodes: DocumentObject[]): {
    textAccuracy: number;
    optionCompleteness: number;
    answerAccuracy: number;
    metadataAccuracy: number;
  } {
    let totalTextAccuracy = 0;
    let totalOptionCompleteness = 0;
    let totalAnswerAccuracy = 0;
    let totalMetadataAccuracy = 0;

    for (const question of questions) {
      const questionNode = documentNodes.find(n => n.id === question.id);

      // Text accuracy
      if (questionNode && questionNode.content) {
        const similarity = this.calculateTextSimilarity(question.statement, questionNode.content);
        totalTextAccuracy += similarity;
      } else {
        totalTextAccuracy += 0.5; // Default if can't compare
      }

      // Option completeness
      if (question.options && question.options.length > 0) {
        totalOptionCompleteness += 1.0;
      } else if (['multiple_choice', 'multiple_select', 'true_false'].includes(question.type)) {
        totalOptionCompleteness += 0.0;
      } else {
        totalOptionCompleteness += 1.0; // Non-MCQ questions don't need options
      }

      // Answer accuracy
      if (question.correctAnswer) {
        totalAnswerAccuracy += 0.7; // Placeholder - would verify against answer key
      } else {
        totalAnswerAccuracy += 0.3;
      }

      // Metadata accuracy
      if (question.metadata.topic && question.metadata.difficulty) {
        totalMetadataAccuracy += 0.8;
      } else {
        totalMetadataAccuracy += 0.5;
      }
    }

    const textAccuracy = questions.length > 0 ? totalTextAccuracy / questions.length : 0;
    const optionCompleteness = questions.length > 0 ? totalOptionCompleteness / questions.length : 0;
    const answerAccuracy = questions.length > 0 ? totalAnswerAccuracy / questions.length : 0;
    const metadataAccuracy = questions.length > 0 ? totalMetadataAccuracy / questions.length : 0;

    this.log(`Content validation - Text: ${textAccuracy}, Options: ${optionCompleteness}, Answer: ${answerAccuracy}`);

    return {
      textAccuracy,
      optionCompleteness,
      answerAccuracy,
      metadataAccuracy,
    };
  }

  /**
   * Validate structure
   */
  private validateStructure(questions: QuestionObject[]): {
    validQuestions: number;
    invalidQuestions: number;
    issues: Array<{ questionId: string; issue: string; severity: 'low' | 'medium' | 'high' }>;
  } {
    let validQuestions = 0;
    let invalidQuestions = 0;
    const issues: Array<{ questionId: string; issue: string; severity: 'low' | 'medium' | 'high' }> = [];

    for (const question of questions) {
      let isValid = true;

      // Check required fields
      if (!question.id || !question.statement) {
        isValid = false;
        issues.push({
          questionId: question.id,
          issue: 'Missing required field (id or statement)',
          severity: 'high',
        });
      }

      // Check type is valid
      const validTypes = [
        'multiple_choice', 'multiple_select', 'true_false', 'fill_blank',
        'short_answer', 'long_answer', 'match_following', 'ordering',
        'assertion_reason', 'case_study', 'reading_comprehension',
        'coding', 'diagram_based', 'mathematical', 'practical', 'essay'
      ];
      if (!validTypes.includes(question.type)) {
        isValid = false;
        issues.push({
          questionId: question.id,
          issue: `Invalid question type: ${question.type}`,
          severity: 'medium',
        });
      }

      // Check confidence is valid
      if (question.confidence.overall < 0 || question.confidence.overall > 1) {
        isValid = false;
        issues.push({
          questionId: question.id,
          issue: 'Invalid confidence score',
          severity: 'medium',
        });
      }

      // Check metadata
      if (!question.metadata.difficulty || !['easy', 'medium', 'hard'].includes(question.metadata.difficulty)) {
        isValid = false;
        issues.push({
          questionId: question.id,
          issue: 'Invalid or missing difficulty',
          severity: 'low',
        });
      }

      if (isValid) {
        validQuestions++;
      } else {
        invalidQuestions++;
      }
    }

    this.log(`Structure validation: ${validQuestions} valid, ${invalidQuestions} invalid`);

    return { validQuestions, invalidQuestions, issues };
  }

  /**
   * Detect all issues
   */
  private detectIssues(
    questions: QuestionObject[],
    documentNodes: DocumentObject[],
    coverage: any,
    boundaries: any,
    content: any,
    structure: any
  ): Array<{ type: string; severity: 'low' | 'medium' | 'high'; description: string; questionId?: string }> {
    const issues: Array<{ type: string; severity: 'low' | 'medium' | 'high'; description: string; questionId?: string }> = [];

    // Coverage issues
    if (coverage.missingQuestions > 0) {
      issues.push({
        type: 'omission',
        severity: 'high',
        description: `Missing ${coverage.missingQuestions} questions from document`,
      });
    }

    if (coverage.extraQuestions > 0) {
      issues.push({
        type: 'hallucination',
        severity: 'high',
        description: `${coverage.extraQuestions} extra questions not in document`,
      });
    }

    if (coverage.coveragePercentage < 80) {
      issues.push({
        type: 'coverage',
        severity: 'medium',
        description: `Low coverage: ${coverage.coveragePercentage.toFixed(1)}%`,
      });
    }

    // Boundary issues
    for (const boundaryIssue of boundaries.issues) {
      issues.push({
        type: 'boundary',
        severity: boundaryIssue.severity,
        description: boundaryIssue.issue,
        questionId: boundaryIssue.questionId,
      });
    }

    // Content issues
    if (content.textAccuracy < 0.8) {
      issues.push({
        type: 'content',
        severity: 'medium',
        description: `Low text accuracy: ${(content.textAccuracy * 100).toFixed(1)}%`,
      });
    }

    if (content.optionCompleteness < 0.9) {
      issues.push({
        type: 'content',
        severity: 'medium',
        description: `Low option completeness: ${(content.optionCompleteness * 100).toFixed(1)}%`,
      });
    }

    if (content.answerAccuracy < 0.7) {
      issues.push({
        type: 'content',
        severity: 'low',
        description: `Low answer accuracy: ${(content.answerAccuracy * 100).toFixed(1)}%`,
      });
    }

    // Structure issues
    for (const structureIssue of structure.issues) {
      issues.push({
        type: 'structure',
        severity: structureIssue.severity,
        description: structureIssue.issue,
        questionId: structureIssue.questionId,
      });
    }

    // Low confidence questions
    for (const question of questions) {
      if (question.confidence.overall < 0.6) {
        issues.push({
          type: 'confidence',
          severity: 'medium',
          description: `Low confidence question: ${(question.confidence.overall * 100).toFixed(1)}%`,
          questionId: question.id,
        });
      }
    }

    return issues;
  }

  /**
   * Calculate overall validation result
   */
  private calculateOverallValidation(
    coverage: any,
    boundaries: any,
    content: any,
    structure: any,
    issues: any[]
  ): {
    isValid: boolean;
    confidence: number;
    issues: Array<{ type: string; severity: 'low' | 'medium' | 'high'; description: string; questionId?: string }>;
  } {
    // Determine if validation passed
    const hasHighSeverityIssues = issues.some(i => i.severity === 'high');
    const hasManyMediumIssues = issues.filter(i => i.severity === 'medium').length > 5;
    const lowCoverage = coverage.coveragePercentage < 70;
    const lowAccuracy = content.textAccuracy < 0.7;

    const isValid = !hasHighSeverityIssues && !hasManyMediumIssues && !lowCoverage && !lowAccuracy;

    // Calculate overall confidence
    const coverageScore = coverage.coveragePercentage / 100;
    const boundaryScore = boundaries.correct / (boundaries.correct + boundaries.incorrect || 1);
    const contentScore = (content.textAccuracy + content.optionCompleteness + content.answerAccuracy) / 3;
    const structureScore = structure.validQuestions / (structure.validQuestions + structure.invalidQuestions || 1);

    const confidence = (coverageScore * 0.3 + boundaryScore * 0.25 + contentScore * 0.3 + structureScore * 0.15);

    return {
      isValid,
      confidence,
      issues,
    };
  }

  /**
   * Calculate text similarity (simple Jaccard similarity)
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    if (union.size === 0) return 0;
    return intersection.size / union.size;
  }
}
