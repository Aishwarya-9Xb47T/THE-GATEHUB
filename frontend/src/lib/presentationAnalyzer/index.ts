/**
 * Presentation Understanding Engine
 * 
 * Main entry point for slide analysis and interaction detection.
 * 
 * Usage:
 * import { PresentationUnderstandingEngine } from '@/lib/presentationAnalyzer';
 * 
 * const analysis = PresentationUnderstandingEngine.analyze(slide);
 * if (analysis.action === 'auto') {
 *   // Auto-detected with high confidence
 * } else if (analysis.action === 'suggest') {
 *   // Show suggestions to instructor
 * } else {
 *   // Manual detection needed
 * }
 */

export type { SlideAnalysis, TextBlock, ImageBlock, TableBlock, DetectedOption, InteractionDetection } from './SlideAnalysis';
export { PresentationAnalyzer } from './PresentationAnalyzer';
export { SlideAnalyzer } from './SlideAnalyzer';
export { SemanticDetector } from './SemanticDetector';
export { InteractionClassifier } from './InteractionClassifier';

import type { SlideAnalysis } from './SlideAnalysis';
import { PresentationAnalyzer } from './PresentationAnalyzer';
import { SlideAnalyzer } from './SlideAnalyzer';
import { SemanticDetector } from './SemanticDetector';
import { InteractionClassifier } from './InteractionClassifier';

export class PresentationUnderstandingEngine {
  /**
   * Complete analysis pipeline:
   * 1. Extract raw content (text, images, layout)
   * 2. Analyze semantic structure
   * 3. Detect interaction using multiple signals
   * 4. Classify with confidence scoring
   */
  static analyze(slide: any): {
    analysis: SlideAnalysis;
    classification: {
      detection: SlideAnalysis['interaction'];
      action: 'auto' | 'suggest' | 'manual';
      suggestions: string[];
    };
  } {
    // Step 1: Extract raw content
    const rawAnalysis = PresentationAnalyzer.analyzeSlide(slide);
    
    // Step 2: Analyze semantic structure
    const semanticAnalysis = SlideAnalyzer.analyzeStructure(slide);
    
    // Step 3: Combine analyses
    const combinedAnalysis: SlideAnalysis = {
      ...rawAnalysis,
      ...semanticAnalysis,
      headings: semanticAnalysis.headings || [],
      bullets: semanticAnalysis.bullets || [],
      paragraphs: semanticAnalysis.paragraphs || [],
      numberedLists: semanticAnalysis.numberedLists || [],
      interaction: SemanticDetector.detectInteraction({ ...rawAnalysis, ...semanticAnalysis }),
    } as SlideAnalysis;
    
    // Step 4: Classify with confidence scoring
    const classification = InteractionClassifier.classify(combinedAnalysis);
    
    // Update interaction with final classification
    combinedAnalysis.interaction = classification.detection;
    
    return {
      analysis: combinedAnalysis,
      classification,
    };
  }

  /**
   * Re-analyze with manual interaction type selection
   */
  static reclassify(slide: any, selectedType: string): SlideAnalysis {
    const rawAnalysis = PresentationAnalyzer.analyzeSlide(slide);
    const semanticAnalysis = SlideAnalyzer.analyzeStructure(slide);
    
    const combinedAnalysis: SlideAnalysis = {
      ...rawAnalysis,
      ...semanticAnalysis,
      headings: semanticAnalysis.headings || [],
      bullets: semanticAnalysis.bullets || [],
      paragraphs: semanticAnalysis.paragraphs || [],
      numberedLists: semanticAnalysis.numberedLists || [],
      interaction: InteractionClassifier.reclassify({ ...rawAnalysis, ...semanticAnalysis }, selectedType),
    } as SlideAnalysis;
    
    return combinedAnalysis;
  }
}
