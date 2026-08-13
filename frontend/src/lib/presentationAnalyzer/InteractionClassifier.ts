/**
 * InteractionClassifier - Confidence scoring and type classification
 * 
 * This module:
 * - Finalizes interaction type based on confidence scores
 * - Provides suggestions for low-confidence detections
 * - Handles edge cases and ambiguous slides
 */

import { SlideAnalysis, InteractionDetection } from './SlideAnalysis';
import { SemanticDetector } from './SemanticDetector';
import { SlideAnalyzer } from './SlideAnalyzer';

export class InteractionClassifier {
  /**
   * Classify interaction and determine if auto-detect or suggestion needed
   */
  static classify(analysis: Partial<SlideAnalysis>): {
    detection: InteractionDetection;
    action: 'auto' | 'suggest' | 'manual';
    suggestions: string[];
  } {
    const detection = SemanticDetector.detectInteraction(analysis);
    
    // Determine action based on confidence
    let action: 'auto' | 'suggest' | 'manual';
    let suggestions: string[] = [];
    
    if (detection.confidence > 0.8) {
      action = 'auto';
    } else if (detection.confidence >= 0.4) {
      action = 'suggest';
      suggestions = this.generateSuggestions(analysis, detection);
    } else {
      action = 'manual';
      suggestions = this.generateSuggestions(analysis, detection);
    }
    
    return {
      detection,
      action,
      suggestions,
    };
  }

  /**
   * Generate suggestions for low-confidence detections
   */
  private static generateSuggestions(
    analysis: Partial<SlideAnalysis>,
    currentDetection: InteractionDetection
  ): string[] {
    let suggestions: string[] = [];
    const textBlocks = analysis.textBlocks || [];
    
    // Always suggest the current detection if it has some confidence
    if (currentDetection.confidence > 0.3) {
      suggestions.push(currentDetection.type);
    }
    
    // Check for other possible interaction types
    const hasOptions = SlideAnalyzer.detectOptions(textBlocks).length >= 2;
    const hasTrueFalse = SlideAnalyzer.detectTrueFalse(textBlocks);
    const hasRating = SlideAnalyzer.detectRating(textBlocks);
    const hasReflection = SlideAnalyzer.detectReflection(textBlocks);
    const hasWordCloud = SlideAnalyzer.detectWordCloud(textBlocks);
    const hasQuestions = SlideAnalyzer.detectQuestions(textBlocks).length > 0;
    
    // Suggest MCQ if options detected
    if (hasOptions && currentDetection.type !== 'mcq') {
      suggestions.push('mcq');
    }
    
    // Suggest True/False if pattern detected
    if (hasTrueFalse && currentDetection.type !== 'true_false') {
      suggestions.push('true_false');
    }
    
    // Suggest Rating if pattern detected
    if (hasRating && currentDetection.type !== 'rating') {
      suggestions.push('rating');
    }
    
    // Suggest Open Answer for reflection
    if (hasReflection && currentDetection.type !== 'open_answer') {
      suggestions.push('open_answer');
    }
    
    // Suggest Word Cloud if pattern detected
    if (hasWordCloud && currentDetection.type !== 'word_cloud') {
      suggestions.push('word_cloud');
    }
    
    // Suggest Discussion if questions but no options
    if (hasQuestions && !hasOptions && !hasTrueFalse) {
      suggestions.push('discussion');
    }
    
    // Remove duplicates and current type
    suggestions = [...new Set(suggestions)].filter(t => t !== currentDetection.type);
    
    // Limit to top 4 suggestions
    return suggestions.slice(0, 4);
  }

  /**
   * Re-run analysis with manual interaction type selection
   */
  static reclassify(
    analysis: Partial<SlideAnalysis>,
    selectedType: string
  ): InteractionDetection {
    const textBlocks = analysis.textBlocks || [];
    const questions = SlideAnalyzer.detectQuestions(textBlocks);
    const options = SlideAnalyzer.detectOptions(textBlocks);
    
    // Build detection based on selected type
    const detection: InteractionDetection = {
      type: selectedType as any,
      confidence: 1.0, // Manual selection = 100% confidence
      reason: 'Manually selected by instructor',
      signals: {
        questionDetected: questions.length > 0,
        optionsDetected: options.length >= 2,
        optionCount: options.length,
        layoutMatches: false,
        keywordMatches: [],
        structuralMatches: ['Manual selection'],
      },
    };
    
    // Add question and options based on type
    if (questions.length > 0) {
      detection.question = questions[0].text;
    }
    
    if (['mcq', 'true_false'].includes(selectedType)) {
      detection.options = options.map(opt => ({
        label: opt.label,
        text: opt.text,
        position: opt.block.position,
      }));
      
      if (selectedType === 'true_false') {
        detection.options = [
          { label: 'A', text: 'True' },
          { label: 'B', text: 'False' },
        ];
      }
    }
    
    return detection;
  }

  /**
   * Validate detection quality
   */
  static validate(detection: InteractionDetection): {
    isValid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
    
    // Check if question exists for types that need it
    if (['mcq', 'true_false', 'open_answer', 'word_cloud'].includes(detection.type)) {
      if (!detection.question || detection.question.length < 3) {
        issues.push('Question is missing or too short');
      }
    }
    
    // Check if options exist for MCQ
    if (detection.type === 'mcq') {
      if (!detection.options || detection.options.length < 2) {
        issues.push('MCQ requires at least 2 options');
      }
    }
    
    // Check confidence threshold
    if (detection.confidence < 0.4) {
      issues.push('Low confidence detection');
    }
    
    return {
      isValid: issues.length === 0,
      issues,
    };
  }
}
