/**
 * Reviewer Agent
 * Professor-level review of extraction quality
 * Asks "If I were giving this exam, would I accept these extracted questions?"
 */

import { BaseAgent } from './BaseAgent.js';
import { AgentInput, AgentOutput, QuestionObject, ValidationResult } from '../types.js';

interface ReviewerResult {
  approved: boolean;
  confidence: number;
  reviewComments: string[];
  rejectedQuestions: Array<{
    questionId: string;
    reason: string;
    severity: 'low' | 'medium' | 'high';
  }>;
  overallAssessment: {
    quality: 'excellent' | 'good' | 'fair' | 'poor';
    readiness: 'ready' | 'needs_review' | 'needs_repair';
    recommendations: string[];
  };
}

export class ReviewerAgent extends BaseAgent {
  constructor() {
    super({
      name: 'Reviewer',
      version: '1.0.0',
      capabilities: [
        'professor_level_review',
        'quality_assessment',
        'acceptance_criteria',
        'recommendation_generation',
        'final_approval',
      ],
      maxRetries: 3,
      timeout: 30000,
    });
  }

  /**
   * Process review
   */
  protected async process(input: AgentInput): Promise<ReviewerResult> {
    this.log('Starting professor-level review');

    // Get questions and validation result from previous agents
    const questions = this.extractQuestions(input);
    const validationResult = this.extractValidationResult(input);

    this.log(`Reviewing ${questions.length} questions`);

    const reviewComments: string[] = [];
    const rejectedQuestions: Array<{
      questionId: string;
      reason: string;
      severity: 'low' | 'medium' | 'high';
    }> = [];

    // Review each question
    for (const question of questions) {
      const review = this.reviewQuestion(question, validationResult);
      
      if (!review.accepted) {
        rejectedQuestions.push({
          questionId: question.id,
          reason: review.reason,
          severity: review.severity,
        });
      }

      if (review.comment) {
        reviewComments.push(review.comment);
      }
    }

    // Calculate overall assessment
    const overallAssessment = this.calculateOverallAssessment(
      questions,
      rejectedQuestions,
      reviewComments,
      validationResult
    );

    // Determine approval
    const approved = overallAssessment.readiness === 'ready';

    // Calculate confidence
    const confidence = this.calculateConfidence(overallAssessment, rejectedQuestions);

    this.log(`Review complete: ${approved ? 'APPROVED' : 'NEEDS REPAIR'}`);

    return {
      approved,
      confidence,
      reviewComments,
      rejectedQuestions,
      overallAssessment,
    };
  }

  /**
   * Calculate confidence for review
   */
  protected calculateConfidence(result: ReviewerResult): number {
    if (result.approved) {
      return 0.95; // High confidence if approved
    }

    // Confidence based on severity of issues
    const highSeverityRejections = result.rejectedQuestions.filter(r => r.severity === 'high').length;
    const mediumSeverityRejections = result.rejectedQuestions.filter(r => r.severity === 'medium').length;

    let confidence = 0.8;
    confidence -= highSeverityRejections * 0.2;
    confidence -= mediumSeverityRejections * 0.1;

    return Math.max(confidence, 0.3);
  }

  /**
   * Extract questions from input
   */
  private extractQuestions(input: AgentInput): QuestionObject[] {
    if (input.config?.previousAgentResult?.result?.repairedQuestions) {
      return input.config.previousAgentResult.result.repairedQuestions;
    }
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
  private extractValidationResult(input: AgentInput): ValidationResult | null {
    if (input.config?.dependencyResults) {
      for (const depResult of input.config.dependencyResults) {
        if (depResult.result?.validationResult) {
          return depResult.result.validationResult;
        }
      }
    }
    return null;
  }

  /**
   * Review a single question
   */
  private reviewQuestion(
    question: QuestionObject,
    validationResult: ValidationResult | null
  ): { accepted: boolean; reason?: string; severity?: 'low' | 'medium' | 'high'; comment?: string } {
    const issues: string[] = [];

    // Check confidence
    if (question.confidence.overall < 0.6) {
      issues.push('Low confidence');
    }

    // Check statement quality
    if (question.statement.length < 10) {
      issues.push('Statement too short');
    }

    // Check options for MCQ types
    if (['multiple_choice', 'multiple_select'].includes(question.type)) {
      if (!question.options || question.options.length < 2) {
        issues.push('Insufficient options');
      }
    }

    // Check answer
    if (!question.correctAnswer && ['multiple_choice', 'true_false'].includes(question.type)) {
      issues.push('Missing answer');
    }

    // Check validation issues
    if (validationResult) {
      const boundaryIssue = validationResult.boundaries.issues.find(i => i.questionId === question.id);
      if (boundaryIssue) {
        issues.push(`Boundary issue: ${boundaryIssue.issue}`);
      }

      const structureIssue = validationResult.structure.issues.find(i => i.questionId === question.id);
      if (structureIssue) {
        issues.push(`Structure issue: ${structureIssue.issue}`);
      }
    }

    // Determine acceptance
    if (issues.length === 0) {
      return { accepted: true };
    }

    // Determine severity
    const severity = this.determineSeverity(issues);

    // Generate comment
    const comment = `Question ${question.id}: ${issues.join(', ')}`;

    return {
      accepted: false,
      reason: issues.join('; '),
      severity,
      comment,
    };
  }

  /**
   * Determine severity of issues
   */
  private determineSeverity(issues: string[]): 'low' | 'medium' | 'high' {
    const criticalIssues = ['Statement too short', 'Insufficient options', 'Missing answer'];
    
    if (issues.some(issue => criticalIssues.some(ci => issue.includes(ci)))) {
      return 'high';
    }

    if (issues.length >= 3) {
      return 'high';
    }

    if (issues.length === 2) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Calculate overall assessment
   */
  private calculateOverallAssessment(
    questions: QuestionObject[],
    rejectedQuestions: Array<{ questionId: string; reason: string; severity: 'low' | 'medium' | 'high' }>,
    reviewComments: string[],
    validationResult: ValidationResult | null
  ): {
    quality: 'excellent' | 'good' | 'fair' | 'poor';
    readiness: 'ready' | 'needs_review' | 'needs_repair';
    recommendations: string[];
  } {
    const totalQuestions = questions.length;
    const rejectedCount = rejectedQuestions.length;
    const rejectionRate = totalQuestions > 0 ? rejectedCount / totalQuestions : 0;

    // Determine quality
    let quality: 'excellent' | 'good' | 'fair' | 'poor';
    if (rejectionRate === 0) {
      quality = 'excellent';
    } else if (rejectionRate < 0.1) {
      quality = 'good';
    } else if (rejectionRate < 0.3) {
      quality = 'fair';
    } else {
      quality = 'poor';
    }

    // Determine readiness
    let readiness: 'ready' | 'needs_review' | 'needs_repair';
    const highSeverityRejections = rejectedQuestions.filter(r => r.severity === 'high').length;

    if (highSeverityRejections === 0 && rejectionRate < 0.1) {
      readiness = 'ready';
    } else if (highSeverityRejections === 0 && rejectionRate < 0.3) {
      readiness = 'needs_review';
    } else {
      readiness = 'needs_repair';
    }

    // Generate recommendations
    const recommendations: string[] = [];

    if (validationResult) {
      if (validationResult.coverage.coveragePercentage < 90) {
        recommendations.push('Review coverage - some questions may be missing');
      }

      if (validationResult.content.textAccuracy < 0.85) {
        recommendations.push('Review text accuracy - some content may be inaccurate');
      }

      if (validationResult.content.optionCompleteness < 0.9) {
        recommendations.push('Review options - some questions may have incomplete options');
      }
    }

    if (highSeverityRejections > 0) {
      recommendations.push(`Repair ${highSeverityRejections} high-severity issues`);
    }

    if (rejectionRate > 0.1) {
      recommendations.push('Review rejected questions manually');
    }

    if (recommendations.length === 0) {
      recommendations.push('Extraction is ready for use');
    }

    return {
      quality,
      readiness,
      recommendations,
    };
  }
}
