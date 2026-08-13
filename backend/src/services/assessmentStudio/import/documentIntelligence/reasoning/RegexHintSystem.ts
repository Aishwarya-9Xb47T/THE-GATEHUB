/**
 * Regex-as-Hint System
 * Uses regex patterns as hints that are verified by AI
 * Regex suggestions are not trusted as definitive - AI must verify them
 */

export interface RegexHint {
  pattern: string;
  description: string;
  confidence: number;
  category: 'question' | 'option' | 'heading' | 'instruction' | 'answer';
  verified: boolean;
  aiVerification?: {
    verified: boolean;
    confidence: number;
    reason: string;
  };
}

export interface RegexHintResult {
  matches: Array<{
    text: string;
    position: number;
    hint: RegexHint;
  }>;
  verifiedMatches: Array<{
    text: string;
    position: number;
    hint: RegexHint;
  }>;
  rejectedMatches: Array<{
    text: string;
    position: number;
    hint: RegexHint;
    reason: string;
  }>;
}

export class RegexHintSystem {
  private hints: RegexHint[];
  private verificationHistory: Map<string, {
    timestamp: Date;
    verified: boolean;
    confidence: number;
  }>;

  constructor() {
    this.hints = this.initializeHints();
    this.verificationHistory = new Map();
  }

  /**
   * Initialize regex hints
   */
  private initializeHints(): RegexHint[] {
    return [
      // Question patterns
      {
        pattern: '(?:Q\\d+[\\.\\)]\\s+|\\d+[\\.\\)]\\s+)?(What|Which|Who|When|Where|Why|How)\\s+',
        description: 'Question starting with question word',
        confidence: 0.7,
        category: 'question',
        verified: false,
      },
      {
        pattern: '^\\d+[\\.\\)]\\s+.+\\?$',
        description: 'Numbered question ending with question mark',
        confidence: 0.75,
        category: 'question',
        verified: false,
      },
      {
        pattern: '^(?:Choose|Select|Identify|Determine)\\s+(?:the\\s+)?(?:correct\\s+)?answer',
        description: 'Instruction to choose answer',
        confidence: 0.65,
        category: 'question',
        verified: false,
      },

      // Option patterns
      {
        pattern: '^[a-e][\\.\\)]\\s+',
        description: 'Option marker (A-E)',
        confidence: 0.85,
        category: 'option',
        verified: false,
      },
      {
        pattern: '^\\(\\s*[a-e]\\s*\\)\\s+',
        description: 'Option marker in parentheses (A-E)',
        confidence: 0.8,
        category: 'option',
        verified: false,
      },
      {
        pattern: '^\\d+[\\.\\)]\\s+(?!\\d+\\s+[a-e])',
        description: 'Numbered option (1-9)',
        confidence: 0.7,
        category: 'option',
        verified: false,
      },

      // Heading patterns
      {
        pattern: '^(?:Chapter|Section|Part|Unit|Module)\\s+\\d+',
        description: 'Section header',
        confidence: 0.8,
        category: 'heading',
        verified: false,
      },
      {
        pattern: '^[A-Z][A-Z\\s]{5,50}$',
        description: 'All caps heading',
        confidence: 0.6,
        category: 'heading',
        verified: false,
      },

      // Instruction patterns
      {
        pattern: '^(?:Instructions|Directions|Guidelines)\\s*:',
        description: 'Instruction header',
        confidence: 0.9,
        category: 'instruction',
        verified: false,
      },
      {
        pattern: '^(?:Answer\\s+all\\s+questions|Choose\\s+the\\s+correct\\s+answer)',
        description: 'Instruction text',
        confidence: 0.7,
        category: 'instruction',
        verified: false,
      },

      // Answer patterns
      {
        pattern: '^Answer\\s*:\\s*([a-eA-E])$',
        description: 'Answer key format',
        confidence: 0.85,
        category: 'answer',
        verified: false,
      },
      {
        pattern: '^Key\\s*:\\s*([a-eA-E])$',
        description: 'Answer key format',
        confidence: 0.8,
        category: 'answer',
        verified: false,
      },
    ];
  }

  /**
   * Find regex hints in text
   */
  findHints(text: string): RegexHintResult {
    const matches: Array<{
      text: string;
      position: number;
      hint: RegexHint;
    }> = [];

    for (const hint of this.hints) {
      const regex = new RegExp(hint.pattern, 'gm');
      let match;

      while ((match = regex.exec(text)) !== null) {
        matches.push({
          text: match[0],
          position: match.index,
          hint,
        });
      }
    }

    // Sort by position
    matches.sort((a, b) => a.position - b.position);

    return {
      matches,
      verifiedMatches: [],
      rejectedMatches: [],
    };
  }

  /**
   * Verify regex hint with AI (simulated)
   * In production, this would call an AI model to verify the hint
   */
  async verifyHint(hint: RegexHint, text: string, context: {
    surroundingText: string;
    documentPage: number;
  }): Promise<RegexHint> {
    console.log(`[RegexHintSystem] Verifying hint: ${hint.description}`);

    // Simulated AI verification
    // In production, this would call an actual AI model
    const verification = this.simulateAIVerification(hint, text, context);

    hint.verified = verification.verified;
    hint.aiVerification = verification;

    // Store verification history
    const historyKey = `${hint.pattern}-${text.substring(0, 20)}`;
    this.verificationHistory.set(historyKey, {
      timestamp: new Date(),
      verified: verification.verified,
      confidence: verification.confidence,
    });

    return hint;
  }

  /**
   * Simulate AI verification (placeholder)
   * In production, this would call an actual AI model
   */
  private simulateAIVerification(
    hint: RegexHint,
    text: string,
    context: { surroundingText: string; documentPage: number }
  ): { verified: boolean; confidence: number; reason: string } {
    // Simple heuristic simulation
    // In production, use actual AI model

    let verified = true;
    let confidence = hint.confidence;
    let reason = 'Pattern matches context';

    // Check if pattern makes sense in context
    if (hint.category === 'question') {
      // Question should be followed by options or be substantial
      if (text.length < 10) {
        verified = false;
        confidence *= 0.5;
        reason = 'Question too short';
      }
    }

    if (hint.category === 'option') {
      // Option should be short and not a complete sentence
      if (text.length > 100) {
        verified = false;
        confidence *= 0.6;
        reason = 'Option too long, might not be an option';
      }
    }

    if (hint.category === 'heading') {
      // Heading should be early in document or followed by content
      if (context.documentPage > 5 && text.length > 50) {
        verified = false;
        confidence *= 0.5;
        reason = 'Heading too late in document and too long';
      }
    }

    return { verified, confidence, reason };
  }

  /**
   * Verify all hints in text
   */
  async verifyAllHints(
    text: string,
    context: { surroundingText: string; documentPage: number }
  ): Promise<RegexHintResult> {
    const hintResult = this.findHints(text);
    const verifiedMatches: Array<{
      text: string;
      position: number;
      hint: RegexHint;
    }> = [];
    const rejectedMatches: Array<{
      text: string;
      position: number;
      hint: RegexHint;
      reason: string;
    }> = [];

    for (const match of hintResult.matches) {
      const verifiedHint = await this.verifyHint(match.hint, match.text, context);

      if (verifiedHint.verified && verifiedHint.aiVerification) {
        verifiedMatches.push({
          text: match.text,
          position: match.position,
          hint: verifiedHint,
        });
      } else {
        rejectedMatches.push({
          text: match.text,
          position: match.position,
          hint: verifiedHint,
          reason: verifiedHint.aiVerification?.reason || 'Verification failed',
        });
      }
    }

    return {
      matches: hintResult.matches,
      verifiedMatches,
      rejectedMatches,
    };
  }

  /**
   * Add custom hint
   */
  addHint(hint: RegexHint): void {
    this.hints.push(hint);
    console.log(`[RegexHintSystem] Added hint: ${hint.description}`);
  }

  /**
   * Remove hint by pattern
   */
  removeHint(pattern: string): void {
    this.hints = this.hints.filter(h => h.pattern !== pattern);
    console.log(`[RegexHintSystem] Removed hint with pattern: ${pattern}`);
  }

  /**
   * Get all hints
   */
  getHints(): RegexHint[] {
    return [...this.hints];
  }

  /**
   * Get hints by category
   */
  getHintsByCategory(category: RegexHint['category']): RegexHint[] {
    return this.hints.filter(h => h.category === category);
  }

  /**
   * Get verification statistics
   */
  getVerificationStatistics(): {
    totalVerifications: number;
    verifiedCount: number;
    rejectedCount: number;
    verificationRate: number;
    averageConfidence: number;
  } {
    const total = this.verificationHistory.size;
    let verifiedCount = 0;
    let totalConfidence = 0;

    for (const record of this.verificationHistory.values()) {
      if (record.verified) {
        verifiedCount++;
      }
      totalConfidence += record.confidence;
    }

    return {
      totalVerifications: total,
      verifiedCount,
      rejectedCount: total - verifiedCount,
      verificationRate: total > 0 ? verifiedCount / total : 0,
      averageConfidence: total > 0 ? totalConfidence / total : 0,
    };
  }

  /**
   * Reset verification history
   */
  resetHistory(): void {
    this.verificationHistory.clear();
    console.log('[RegexHintSystem] Verification history reset');
  }

  /**
   * Reset to default hints
   */
  resetHints(): void {
    this.hints = this.initializeHints();
    console.log('[RegexHintSystem] Hints reset to defaults');
  }

  /**
   * Export hints as JSON
   */
  exportHints(): string {
    return JSON.stringify(this.hints, null, 2);
  }

  /**
   * Import hints from JSON
   */
  importHints(json: string): void {
    try {
      const hints = JSON.parse(json) as RegexHint[];
      this.hints = hints;
      console.log(`[RegexHintSystem] Imported ${hints.length} hints`);
    } catch (error) {
      console.error('[RegexHintSystem] Failed to import hints:', error);
    }
  }
}
