/**
 * SemanticDetector - Multi-signal interaction detection
 * 
 * This module uses multiple signals to detect interactions:
 * - Question detection
 * - Option detection
 * - Layout analysis
 * - Keyword matching
 * - Structural analysis
 * 
 * Each detector returns confidence scores and reasons.
 */

import { SlideAnalysis, InteractionDetection, DetectedOption } from './SlideAnalysis';
import { SlideAnalyzer } from './SlideAnalyzer';

export class SemanticDetector {
  /**
   * Detect interaction type using multiple signals
   */
  static detectInteraction(analysis: Partial<SlideAnalysis>): InteractionDetection {
    const textBlocks = analysis.textBlocks || [];
    const layout = SlideAnalyzer.analyzeLayoutForInteraction(textBlocks);
    
    // Run all detectors
    const mcqResult = this.detectMCQ(analysis, layout);
    const trueFalseResult = this.detectTrueFalse(analysis, layout);
    const ratingResult = this.detectRating(analysis, layout);
    const reflectionResult = this.detectReflection(analysis, layout);
    const wordCloudResult = this.detectWordCloud(analysis, layout);
    
    // Select the highest confidence detection
    const detections = [
      mcqResult,
      trueFalseResult,
      ratingResult,
      reflectionResult,
      wordCloudResult,
    ];
    
    const bestDetection = detections.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );
    
    return bestDetection;
  }

  /**
   * Detect MCQ (Multiple Choice Question)
   */
  private static detectMCQ(
    analysis: Partial<SlideAnalysis>,
    layout: any
  ): InteractionDetection {
    const textBlocks = analysis.textBlocks || [];
    const questions = SlideAnalyzer.detectQuestions(textBlocks);
    const options = SlideAnalyzer.detectOptions(textBlocks);
    
    let confidence = 0;
    const signals = {
      questionDetected: questions.length > 0,
      optionsDetected: options.length >= 2,
      optionCount: options.length,
      layoutMatches: false,
      keywordMatches: [] as string[],
      structuralMatches: [] as string[],
    };

    // Signal 1: Question detected
    if (signals.questionDetected) {
      confidence += 0.3;
      signals.structuralMatches.push('Question sentence found');
    }

    // Signal 2: Options detected (A, B, C, D or 1, 2, 3, 4)
    if (signals.optionsDetected) {
      confidence += 0.4;
      signals.structuralMatches.push(`${options.length} options detected`);
    }

    // Signal 3: Layout matches (question at top, options below)
    if (layout.hasQuestionAtTop && layout.hasOptionsBelow) {
      confidence += 0.15;
      signals.layoutMatches = true;
      signals.structuralMatches.push('Question at top, options below');
    }

    // Signal 4: Options are aligned (typical of MCQ)
    if (signals.optionsDetected && layout.optionsAreAligned) {
      confidence += 0.1;
      signals.structuralMatches.push('Options are aligned');
    }

    // Signal 5: Options are vertical (typical of MCQ)
    if (signals.optionsDetected && layout.optionsAreVertical) {
      confidence += 0.05;
      signals.structuralMatches.push('Options are vertical');
    }

    // Signal 6: Keyword matching
    const mcqKeywords = ['choose', 'select', 'pick', 'which one', 'correct answer'];
    const text = textBlocks.map(b => b.text.toLowerCase()).join(' ');
    mcqKeywords.forEach(keyword => {
      if (text.includes(keyword)) {
        confidence += 0.05;
        signals.keywordMatches.push(keyword);
      }
    });

    // Cap confidence at 1.0
    confidence = Math.min(confidence, 1.0);

    // Extract question and options
    const question = questions.length > 0 ? questions[0].text : undefined;
    const detectedOptions: DetectedOption[] = options.map(opt => ({
      label: opt.label,
      text: opt.text,
      position: opt.block.position,
    }));

    return {
      type: 'mcq',
      confidence,
      reason: this.buildReason(signals, 'MCQ'),
      signals,
      question,
      options: detectedOptions,
    };
  }

  /**
   * Detect True/False
   */
  private static detectTrueFalse(
    analysis: Partial<SlideAnalysis>,
    layout: any
  ): InteractionDetection {
    const textBlocks = analysis.textBlocks || [];
    const questions = SlideAnalyzer.detectQuestions(textBlocks);
    const hasTrueFalse = SlideAnalyzer.detectTrueFalse(textBlocks);
    
    let confidence = 0;
    const signals = {
      questionDetected: questions.length > 0,
      optionsDetected: false,
      optionCount: 0,
      layoutMatches: false,
      keywordMatches: [] as string[],
      structuralMatches: [] as string[],
    };

    // Signal 1: True/False keywords detected
    if (hasTrueFalse) {
      confidence += 0.6;
      signals.keywordMatches.push('True/False pattern');
    }

    // Signal 2: Question detected
    if (signals.questionDetected) {
      confidence += 0.2;
      signals.structuralMatches.push('Question sentence found');
    }

    // Signal 3: Statement format (not a question)
    const text = textBlocks.map(b => b.text.toLowerCase()).join(' ');
    if (!text.includes('?') && !text.includes('what') && !text.includes('how')) {
      confidence += 0.1;
      signals.structuralMatches.push('Statement format');
    }

    // Signal 4: Limited text (typical of True/False)
    const wordCount = analysis.wordCount || 0;
    if (wordCount < 50) {
      confidence += 0.1;
      signals.structuralMatches.push('Concise statement');
    }

    confidence = Math.min(confidence, 1.0);

    const question = questions.length > 0 ? questions[0].text : textBlocks[0]?.text;
    const options: DetectedOption[] = [
      { label: 'A', text: 'True' },
      { label: 'B', text: 'False' },
    ];

    return {
      type: 'true_false',
      confidence,
      reason: this.buildReason(signals, 'True/False'),
      signals,
      question,
      options,
    };
  }

  /**
   * Detect Rating
   */
  private static detectRating(
    analysis: Partial<SlideAnalysis>,
    layout: any
  ): InteractionDetection {
    const textBlocks = analysis.textBlocks || [];
    const hasRating = SlideAnalyzer.detectRating(textBlocks);
    
    let confidence = 0;
    const signals = {
      questionDetected: false,
      optionsDetected: false,
      optionCount: 0,
      layoutMatches: false,
      keywordMatches: [] as string[],
      structuralMatches: [] as string[],
    };

    // Signal 1: Rating keywords detected
    if (hasRating) {
      confidence += 0.7;
      signals.keywordMatches.push('Rating/Scale pattern');
    }

    // Signal 2: Number range detected (1-5, 1-10)
    const text = textBlocks.map(b => b.text.toLowerCase()).join(' ');
    const numberRange = text.match(/\b\d+-\d+\b/);
    if (numberRange) {
      confidence += 0.2;
      signals.keywordMatches.push(`Number range: ${numberRange[0]}`);
    }

    // Signal 3: Star/emoji indicators
    if (text.includes('⭐') || text.includes('star') || text.includes('★')) {
      confidence += 0.1;
      signals.keywordMatches.push('Star/emoji indicator');
    }

    confidence = Math.min(confidence, 1.0);

    const question = textBlocks.find(b => 
      b.text.toLowerCase().includes('rate') || 
      b.text.toLowerCase().includes('score')
    )?.text || 'Rate this';

    return {
      type: 'rating',
      confidence,
      reason: this.buildReason(signals, 'Rating'),
      signals,
      question,
    };
  }

  /**
   * Detect Reflection/Open Answer
   */
  private static detectReflection(
    analysis: Partial<SlideAnalysis>,
    layout: any
  ): InteractionDetection {
    const textBlocks = analysis.textBlocks || [];
    const hasReflection = SlideAnalyzer.detectReflection(textBlocks);
    
    let confidence = 0;
    const signals = {
      questionDetected: false,
      optionsDetected: false,
      optionCount: 0,
      layoutMatches: false,
      keywordMatches: [] as string[],
      structuralMatches: [] as string[],
    };

    // Signal 1: Reflection keywords detected
    if (hasReflection) {
      confidence += 0.6;
      signals.keywordMatches.push('Reflection keyword');
    }

    // Signal 2: Open-ended question words
    const text = textBlocks.map(b => b.text.toLowerCase()).join(' ');
    const openEndedWords = ['why', 'how', 'what do you think', 'your opinion', 'explain'];
    openEndedWords.forEach(word => {
      if (text.includes(word)) {
        confidence += 0.1;
        signals.keywordMatches.push(word);
      }
    });

    // Signal 3: No options detected (indicates open answer)
    const options = SlideAnalyzer.detectOptions(textBlocks);
    if (options.length === 0 && !SlideAnalyzer.detectTrueFalse(textBlocks)) {
      confidence += 0.2;
      signals.structuralMatches.push('No options detected');
    }

    // Signal 4: Longer text (typical of reflection)
    const wordCount = analysis.wordCount || 0;
    if (wordCount > 20) {
      confidence += 0.1;
      signals.structuralMatches.push('Substantial text content');
    }

    confidence = Math.min(confidence, 1.0);

    const question = textBlocks.find(b => 
      b.text.toLowerCase().includes('explain') || 
      b.text.toLowerCase().includes('describe') ||
      b.text.toLowerCase().includes('discuss')
    )?.text || textBlocks[0]?.text;

    return {
      type: 'open_answer',
      confidence,
      reason: this.buildReason(signals, 'Open Answer'),
      signals,
      question,
    };
  }

  /**
   * Detect Word Cloud
   */
  private static detectWordCloud(
    analysis: Partial<SlideAnalysis>,
    layout: any
  ): InteractionDetection {
    const textBlocks = analysis.textBlocks || [];
    const hasWordCloud = SlideAnalyzer.detectWordCloud(textBlocks);
    
    let confidence = 0;
    const signals = {
      questionDetected: false,
      optionsDetected: false,
      optionCount: 0,
      layoutMatches: false,
      keywordMatches: [] as string[],
      structuralMatches: [] as string[],
    };

    // Signal 1: Word cloud keywords detected
    if (hasWordCloud) {
      confidence += 0.7;
      signals.keywordMatches.push('Word cloud keyword');
    }

    // Signal 2: Short phrase indicators
    const text = textBlocks.map(b => b.text.toLowerCase()).join(' ');
    if (text.includes('one word') || text.includes('single word') || text.includes('short phrase')) {
      confidence += 0.2;
      signals.keywordMatches.push('Short phrase indicator');
    }

    // Signal 3: No options detected
    const options = SlideAnalyzer.detectOptions(textBlocks);
    if (options.length === 0) {
      confidence += 0.1;
      signals.structuralMatches.push('No options detected');
    }

    confidence = Math.min(confidence, 1.0);

    const question = textBlocks.find(b => 
      b.text.toLowerCase().includes('keyword') || 
      b.text.toLowerCase().includes('word')
    )?.text || 'Enter a word or phrase';

    return {
      type: 'word_cloud',
      confidence,
      reason: this.buildReason(signals, 'Word Cloud'),
      signals,
      question,
    };
  }

  /**
   * Build human-readable reason for detection
   */
  private static buildReason(signals: any, type: string): string {
    const reasons: string[] = [];
    
    if (signals.keywordMatches.length > 0) {
      reasons.push(`Keywords: ${signals.keywordMatches.join(', ')}`);
    }
    
    if (signals.structuralMatches.length > 0) {
      reasons.push(`Structure: ${signals.structuralMatches.join(', ')}`);
    }
    
    if (signals.layoutMatches) {
      reasons.push('Layout matches pattern');
    }
    
    if (reasons.length === 0) {
      return `Detected as ${type} based on analysis`;
    }
    
    return `Detected as ${type}: ${reasons.join('; ')}`;
  }
}
