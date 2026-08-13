/**
 * Question Reasoner Agent
 * Specializes in determining question metadata: type, difficulty, Bloom's level, skills, topics
 */

import { BaseAgent } from './BaseAgent.js';
import { AgentInput, AgentOutput, QuestionObject, QuestionType, Difficulty, BloomLevel } from '../types.js';

interface QuestionReasoningResult {
  reasonedQuestions: QuestionObject[];
  confidence: number;
  statistics: {
    totalQuestions: number;
    typeDistribution: Record<QuestionType, number>;
    difficultyDistribution: Record<Difficulty, number>;
    bloomDistribution: Record<BloomLevel, number>;
  };
}

export class QuestionReasonerAgent extends BaseAgent {
  constructor() {
    super({
      name: 'QuestionReasoner',
      version: '1.0.0',
      capabilities: [
        'question_type_classification',
        'difficulty_estimation',
        'bloom_level_classification',
        'skill_extraction',
        'topic_classification',
        'metadata_inference',
      ],
      maxRetries: 3,
      timeout: 30000,
    });
  }

  /**
   * Process question reasoning
   */
  protected async process(input: AgentInput): Promise<QuestionReasoningResult> {
    this.log('Starting question reasoning');

    // Get questions from previous agent result or from config
    const questions = this.extractQuestions(input);
    this.log(`Reasoning ${questions.length} questions`);

    const reasonedQuestions: QuestionObject[] = [];
    const typeDistribution: Record<QuestionType, number> = {} as any;
    const difficultyDistribution: Record<Difficulty, number> = {} as any;
    const bloomDistribution: Record<BloomLevel, number> = {} as any;

    // Reason each question
    for (const question of questions) {
      const reasoned = await this.reasonQuestion(question);
      reasonedQuestions.push(reasoned);

      // Update distributions
      typeDistribution[reasoned.type] = (typeDistribution[reasoned.type] || 0) + 1;
      difficultyDistribution[reasoned.metadata.difficulty] = (difficultyDistribution[reasoned.metadata.difficulty] || 0) + 1;
      bloomDistribution[reasoned.metadata.bloomLevel] = (bloomDistribution[reasoned.metadata.bloomLevel] || 0) + 1;
    }

    // Calculate overall confidence
    const confidence = this.calculateConfidence({
      reasonedQuestions,
      confidence: 0,
      statistics: {
        totalQuestions: questions.length,
        typeDistribution,
        difficultyDistribution,
        bloomDistribution,
      },
    });

    this.log('Question reasoning complete');

    return {
      reasonedQuestions,
      confidence,
      statistics: {
        totalQuestions: questions.length,
        typeDistribution,
        difficultyDistribution,
        bloomDistribution,
      },
    };
  }

  /**
   * Calculate confidence for question reasoning
   */
  protected calculateConfidence(result: QuestionReasoningResult): number {
    if (result.reasonedQuestions.length === 0) return 0;

    const avgConfidence = result.reasonedQuestions.reduce(
      (sum, q) => sum + q.confidence.overall,
      0
    ) / result.reasonedQuestions.length;

    return avgConfidence;
  }

  /**
   * Initialize statistics object
   */
  private initializeStatistics(): {
    totalQuestions: number;
    typeDistribution: Record<QuestionType, number>;
    difficultyDistribution: Record<Difficulty, number>;
    bloomDistribution: Record<BloomLevel, number>;
  } {
    return {
      totalQuestions: 0,
      typeDistribution: {} as any,
      difficultyDistribution: {} as any,
      bloomDistribution: {} as any,
    };
  }

  /**
   * Extract questions from input
   */
  private extractQuestions(input: AgentInput): QuestionObject[] {
    // Check if questions are in config from previous agent
    if (input.config?.previousAgentResult?.result?.questions) {
      return input.config.previousAgentResult.result.questions;
    }

    // If not, return empty array (should not happen in normal flow)
    this.log('No questions found in input, returning empty array');
    return [];
  }

  /**
   * Reason a single question with enhanced semantic understanding
   * Think like a human educator analyzing the question
   */
  private async reasonQuestion(question: QuestionObject): Promise<QuestionObject> {
    // Gather evidence for decision making
    const evidence = this.gatherEvidence(question);
    
    // Refine question type with semantic reasoning
    const refinedType = this.refineQuestionTypeWithReasoning(question, evidence);
    question.type = refinedType.type;
    
    // Estimate difficulty with cognitive load analysis
    const difficulty = this.estimateDifficultyWithReasoning(question, evidence);
    question.metadata.difficulty = difficulty.difficulty;
    
    // Classify Bloom's level with cognitive hierarchy analysis
    const bloomLevel = this.classifyBloomLevelWithReasoning(question, evidence);
    question.metadata.bloomLevel = bloomLevel.level;
    
    // Extract skills with semantic analysis
    const skills = this.extractSkillsWithReasoning(question, evidence);
    question.metadata.skills = skills.skills;
    
    // Refine topic with semantic clustering
    const topic = this.refineTopicWithReasoning(question, evidence);
    question.metadata.topic = topic.topic;
    
    // Extract subtopic with hierarchical analysis
    const subtopic = this.extractSubtopicWithReasoning(question, evidence);
    question.metadata.subtopic = subtopic.subtopic;

    // Build comprehensive reasoning tree
    const reasoning = this.buildReasoningTree(question, {
      type: refinedType,
      difficulty: difficulty,
      bloomLevel: bloomLevel,
      skills: skills,
      topic: topic,
      subtopic: subtopic,
      evidence
    });
    question.reasoning = reasoning;

    // Update confidence breakdown with per-field confidence
    question.confidence = {
      ocr: question.confidence.ocr || 0.9,
      layout: question.confidence.layout || 0.9,
      questionBoundary: refinedType.confidence,
      options: question.confidence.options || 0.9,
      answer: question.confidence.answer || 0.9,
      semantic: reasoning.confidence,
      overall: this.calculateQuestionConfidence(question)
    };

    return question;
  }

  /**
   * Gather comprehensive evidence for decision making
   */
  private gatherEvidence(question: QuestionObject): {
    statementAnalysis: any;
    optionAnalysis: any;
    contextAnalysis: any;
    structuralAnalysis: any;
    semanticAnalysis: any;
  } {
    const statement = (question.statement || '').toLowerCase();
    const options = question.options || [];
    
    return {
      statementAnalysis: {
        length: question.statement?.length || 0,
        hasQuestionMark: statement.includes('?'),
        interrogatives: this.extractInterrogatives(statement),
        complexity: this.analyzeComplexity(statement),
        domain: this.detectDomain(statement),
        actionVerbs: this.extractActionVerbs(statement)
      },
      optionAnalysis: {
        count: options.length,
        hasMarkers: options.some(o => /^[A-D]\)|^\(A-D\)|^[1-4]\)/i.test(o.text)),
        consistency: this.analyzeOptionConsistency(options),
        hasCorrectMarkers: options.some(o => o.isCorrect),
        avgLength: options.reduce((sum, o) => sum + o.text.length, 0) / options.length
      },
      contextAnalysis: {
        hasTable: !!question.table,
        hasImage: !!question.diagram,
        hasCode: !!question.code,
        hasFormula: !!(question.equations && question.equations.length > 0),
        hasPassage: !!question.passage,
        contextDepth: this.analyzeContextDepth(question)
      },
      structuralAnalysis: {
        hasNumbering: /^\d+[\.\)]/.test(question.statement || ''),
        hasLabeling: /^(question|q|exercise|problem|practice)/i.test(statement),
        formatting: this.analyzeFormatting(question.statement || ''),
        position: question.metadata?.sourcePage || 0
      },
      semanticAnalysis: {
        intent: this.detectIntent(statement),
        cognitiveLevel: this.detectCognitiveLevel(statement),
        requiresComputation: statement.includes('calculate') || statement.includes('compute') || statement.includes('solve'),
        requiresAnalysis: statement.includes('analyze') || statement.includes('compare') || statement.includes('evaluate'),
        requiresSynthesis: statement.includes('create') || statement.includes('design') || statement.includes('develop')
      }
    };
  }

  /**
   * Refine question type with semantic reasoning
   */
  private refineQuestionTypeWithReasoning(
    question: QuestionObject, 
    evidence: any
  ): { type: QuestionType; confidence: number; reasoning: string } {
    const statement = (question.statement || '').toLowerCase();
    const options = question.options || [];
    
    // Build type confidence scores
    const typeScores: Record<string, number> = {};
    
    // MCQ/MQQ indicators
    if (options.length >= 2) {
      typeScores.multiple_choice = 0.7;
      if (options.length >= 4) typeScores.multiple_choice += 0.2;
      if (evidence.optionAnalysis.hasMarkers) typeScores.multiple_choice += 0.1;
      
      // Multiple select indicators
      if (statement.includes('select all') || statement.includes('which of the following are') || 
          statement.includes('multiple correct') || statement.includes('more than one')) {
        typeScores.multiple_select = 0.8;
        if (evidence.optionAnalysis.hasCorrectMarkers && 
            options.filter(o => o.isCorrect).length > 1) {
          typeScores.multiple_select += 0.2;
        }
      }
      
      // True/False indicators
      if (options.length === 2) {
        const optionTexts = options.map(o => o.text.toLowerCase());
        if ((optionTexts.some(t => t === 'true' || t === 'yes') && 
             optionTexts.some(t => t === 'false' || t === 'no')) ||
            statement.includes('true or false') || statement.includes('yes or no')) {
          typeScores.true_false = 0.9;
        }
      }
    }
    
    // Open-ended indicators
    if (options.length === 0) {
      typeScores.short_answer = 0.5;
      
      if (statement.includes('_____') || statement.includes('___') || statement.includes('[blank]')) {
        typeScores.fill_blank = 0.9;
      }
      
      if (evidence.semanticAnalysis.requiresComputation) {
        typeScores.short_answer = 0.7;
      }
      
      if (statement.includes('explain') || statement.includes('describe') || 
          statement.includes('discuss') || statement.includes('analyze') ||
          statement.includes('long answer') || statement.includes('essay')) {
        typeScores.long_answer = 0.8;
      }
    }
    
    // Special type indicators
    if (evidence.contextAnalysis.hasTable) {
      typeScores.table_question = 0.8;
    }
    
    if (statement.includes('match') || statement.includes('column') || 
        question.metadata?.matchingPairs?.length) {
      typeScores.matching = 0.8;
    }
    
    if (statement.includes('order') || statement.includes('sequence') || 
        statement.includes('arrange') || question.metadata?.orderingItems?.length) {
      typeScores.ordering = 0.8;
    }
    
    if (evidence.contextAnalysis.hasCode) {
      typeScores.coding = 0.8;
    }
    
    if (evidence.contextAnalysis.hasFormula) {
      typeScores.equation_question = 0.8;
    }
    
    if (evidence.contextAnalysis.hasImage) {
      typeScores.diagram_question = 0.7;
    }
    
    if (evidence.contextAnalysis.hasPassage) {
      if (statement.includes('case study')) {
        typeScores.case_study = 0.8;
      } else {
        typeScores.reading_comprehension = 0.8;
      }
    }
    
    // Select highest scoring type
    let bestType = 'multiple_choice' as QuestionType;
    let bestScore = 0;
    
    for (const [type, score] of Object.entries(typeScores)) {
      if (score > bestScore) {
        bestScore = score;
        bestType = type as QuestionType;
      }
    }
    
    // If no strong indicators, default based on structure
    if (bestScore < 0.5) {
      bestType = options.length > 0 ? 'multiple_choice' : 'short_answer';
      bestScore = 0.5;
    }
    
    return {
      type: bestType,
      confidence: bestScore,
      reasoning: `Type classification based on: ${Object.entries(typeScores).map(([t, s]) => `${t}(${s.toFixed(2)})`).join(', ')}`
    };
  }

  /**
   * Estimate difficulty with cognitive load analysis
   */
  private estimateDifficultyWithReasoning(
    question: QuestionObject,
    evidence: any
  ): { difficulty: Difficulty; confidence: number; reasoning: string } {
    let difficultyScore = 0;
    const factors: string[] = [];
    
    // Length complexity
    if (evidence.statementAnalysis.length > 100) {
      difficultyScore += 1;
      factors.push('long question text');
    }
    if (evidence.statementAnalysis.length > 200) {
      difficultyScore += 1;
      factors.push('very long question text');
    }
    
    // Option complexity
    if (evidence.optionAnalysis.count > 4) {
      difficultyScore += 1;
      factors.push('many options');
    }
    if (evidence.optionAnalysis.avgLength > 50) {
      difficultyScore += 1;
      factors.push('complex options');
    }
    
    // Cognitive complexity
    if (evidence.semanticAnalysis.requiresAnalysis) {
      difficultyScore += 2;
      factors.push('requires analysis');
    }
    if (evidence.semanticAnalysis.requiresSynthesis) {
      difficultyScore += 2;
      factors.push('requires synthesis');
    }
    if (evidence.semanticAnalysis.requiresComputation) {
      difficultyScore += 1;
      factors.push('requires computation');
    }
    
    // Context complexity
    if (evidence.contextAnalysis.hasTable) {
      difficultyScore += 1;
      factors.push('includes table');
    }
    if (evidence.contextAnalysis.hasCode) {
      difficultyScore += 2;
      factors.push('includes code');
    }
    if (evidence.contextAnalysis.hasFormula) {
      difficultyScore += 2;
      factors.push('includes formula');
    }
    if (evidence.contextAnalysis.hasPassage) {
      difficultyScore += 1;
      factors.push('includes passage');
    }
    
    // Structural complexity
    if (evidence.statementAnalysis.complexity > 0.7) {
      difficultyScore += 1;
      factors.push('complex sentence structure');
    }
    
    // Map score to difficulty
    let difficulty: Difficulty;
    if (difficultyScore <= 2) {
      difficulty = 'easy';
    } else if (difficultyScore <= 5) {
      difficulty = 'medium';
    } else {
      difficulty = 'hard';
    }
    
    const confidence = Math.min(0.9, 0.6 + (difficultyScore * 0.05));
    
    return {
      difficulty,
      confidence,
      reasoning: `Difficulty based on factors: ${factors.join(', ') || 'standard complexity'}`
    };
  }

  /**
   * Classify Bloom's level with cognitive hierarchy analysis
   */
  private classifyBloomLevelWithReasoning(
    question: QuestionObject,
    evidence: any
  ): { level: BloomLevel; confidence: number; reasoning: string } {
    const statement = (question.statement || '').toLowerCase();
    
    // Bloom's level indicators
    const bloomIndicators: Record<BloomLevel, string[]> = {
      L1: ['remember', 'recall', 'identify', 'list', 'name', 'define', 'state'],
      L2: ['understand', 'explain', 'describe', 'summarize', 'interpret', 'classify'],
      L3: ['apply', 'use', 'implement', 'execute', 'carry out', 'calculate'],
      L4: ['analyze', 'compare', 'contrast', 'differentiate', 'examine', 'investigate'],
      L5: ['evaluate', 'assess', 'judge', 'critique', 'justify', 'recommend'],
      L6: ['create', 'design', 'develop', 'construct', 'formulate', 'produce']
    };
    
    const levelScores: Record<BloomLevel, number> = {
      L1: 0, L2: 0, L3: 0, L4: 0, L5: 0, L6: 0
    };
    
    // Score based on action verbs
    for (const [level, indicators] of Object.entries(bloomIndicators)) {
      for (const indicator of indicators) {
        if (statement.includes(indicator)) {
          levelScores[level as BloomLevel] += 0.3;
        }
      }
    }
    
    // Boost based on semantic analysis
    if (evidence.semanticAnalysis.intent === 'recall') {
      levelScores.L1 += 0.4;
    } else if (evidence.semanticAnalysis.intent === 'comprehension') {
      levelScores.L2 += 0.4;
    } else if (evidence.semanticAnalysis.intent === 'application') {
      levelScores.L3 += 0.4;
    } else if (evidence.semanticAnalysis.intent === 'analysis') {
      levelScores.L4 += 0.4;
    } else if (evidence.semanticAnalysis.intent === 'evaluation') {
      levelScores.L5 += 0.4;
    } else if (evidence.semanticAnalysis.intent === 'creation') {
      levelScores.L6 += 0.4;
    }
    
    // Select highest level
    let bestLevel = 'L2' as BloomLevel;
    let bestScore = 0;
    
    for (const [level, score] of Object.entries(levelScores)) {
      if (score > bestScore) {
        bestScore = score;
        bestLevel = level as BloomLevel;
      }
    }
    
    const confidence = Math.min(0.95, 0.5 + bestScore);
    
    return {
      level: bestLevel,
      confidence,
      reasoning: `Bloom's level based on action verbs and cognitive intent`
    };
  }

  /**
   * Extract skills with semantic analysis
   */
  private extractSkillsWithReasoning(
    question: QuestionObject,
    evidence: any
  ): { skills: string[]; confidence: number } {
    const skills: string[] = [];
    const statement = (question.statement || '').toLowerCase();
    
    // Domain-specific skills
    if (evidence.statementAnalysis.domain === 'mathematics') {
      skills.push('calculation', 'problem-solving', 'numerical-reasoning');
    } else if (evidence.statementAnalysis.domain === 'programming') {
      skills.push('coding', 'debugging', 'algorithmic-thinking');
    } else if (evidence.statementAnalysis.domain === 'science') {
      skills.push('scientific-reasoning', 'data-analysis', 'experimental-design');
    } else if (evidence.statementAnalysis.domain === 'language') {
      skills.push('reading-comprehension', 'writing', 'communication');
    }
    
    // Cognitive skills
    if (evidence.semanticAnalysis.requiresAnalysis) {
      skills.push('critical-thinking', 'analysis');
    }
    if (evidence.semanticAnalysis.requiresSynthesis) {
      skills.push('creativity', 'synthesis');
    }
    if (evidence.semanticAnalysis.requiresComputation) {
      skills.push('calculation', 'quantitative-reasoning');
    }
    
    // Context-based skills
    if (evidence.contextAnalysis.hasTable) {
      skills.push('data-interpretation', 'table-analysis');
    }
    if (evidence.contextAnalysis.hasCode) {
      skills.push('programming', 'code-analysis');
    }
    if (evidence.contextAnalysis.hasFormula) {
      skills.push('mathematical-reasoning', 'formula-application');
    }
    
    const confidence = skills.length > 0 ? 0.8 : 0.5;
    
    return { skills, confidence };
  }

  /**
   * Refine topic with semantic clustering
   */
  private refineTopicWithReasoning(
    question: QuestionObject,
    evidence: any
  ): { topic: string; confidence: number } {
    const domain = evidence.statementAnalysis.domain;
    const existingTopic = question.metadata?.topic;
    
    if (existingTopic && typeof existingTopic === 'string') {
      return { topic: existingTopic, confidence: 0.7 };
    }
    
    if (domain) {
      return { topic: domain, confidence: 0.6 };
    }
    
    return { topic: 'General', confidence: 0.3 };
  }

  /**
   * Extract subtopic with hierarchical analysis
   */
  private extractSubtopicWithReasoning(
    question: QuestionObject,
    evidence: any
  ): { subtopic: string; confidence: number } {
    const existingSubtopic = question.metadata?.subtopic;
    
    if (existingSubtopic && typeof existingSubtopic === 'string') {
      return { subtopic: existingSubtopic, confidence: 0.7 };
    }
    
    const actionVerbs = evidence.statementAnalysis.actionVerbs;
    if (actionVerbs.length > 0) {
      return { subtopic: actionVerbs[0], confidence: 0.5 };
    }
    
    return { subtopic: '', confidence: 0.2 };
  }

  /**
   * Build comprehensive reasoning tree
   */
  private buildReasoningTree(
    question: QuestionObject,
    analysis: any
  ): any {
    return {
      decision: `Classified as ${analysis.type.type}, ${analysis.difficulty.difficulty}, ${analysis.bloomLevel.level}`,
      confidence: analysis.type.confidence * analysis.difficulty.confidence * analysis.bloomLevel.confidence,
      evidence: [
        { type: 'semantic_intent', value: analysis.evidence.semanticAnalysis.intent, confidence: 0.8 },
        { type: 'option_pattern', value: analysis.evidence.optionAnalysis.count, confidence: analysis.evidence.optionAnalysis.hasMarkers ? 0.9 : 0.7 },
        { type: 'context', value: analysis.evidence.contextAnalysis, confidence: 0.75 },
        { type: 'cognitive_load', value: analysis.evidence.statementAnalysis.complexity, confidence: 0.7 },
        { type: 'domain_knowledge', value: analysis.evidence.statementAnalysis.domain, confidence: 0.6 }
      ],
      alternatives: [
        { 
          decision: `Alternative type: ${Object.entries(analysis.type).filter(([k]) => k !== 'type' && k !== 'confidence' && k !== 'reasoning').map(([k, v]) => `${k}(${v})`).join(', ')}`, 
          confidence: 1 - analysis.type.confidence, 
          reason: 'Type classification uncertainty' 
        }
      ],
      metadata: {
        typeReasoning: analysis.type.reasoning,
        difficultyReasoning: analysis.difficulty.reasoning,
        bloomReasoning: analysis.bloomLevel.reasoning
      }
    };
  }

  // Helper methods for evidence gathering
  private extractInterrogatives(statement: string): string[] {
    const interrogatives = ['what', 'which', 'who', 'when', 'where', 'why', 'how', 'explain', 'describe', 'discuss', 'analyze', 'evaluate'];
    return interrogatives.filter(i => statement.includes(i));
  }

  private analyzeComplexity(statement: string): number {
    const words = statement.split(/\s+/).length;
    const sentences = statement.split(/[.!?]+/).length;
    const avgWordsPerSentence = words / sentences;
    return Math.min(1, avgWordsPerSentence / 20);
  }

  private detectDomain(statement: string): string {
    const domains = {
      mathematics: ['calculate', 'compute', 'solve', 'equation', 'formula', 'graph', 'angle', 'triangle'],
      programming: ['code', 'function', 'variable', 'algorithm', 'programming', 'debug', 'syntax'],
      science: ['experiment', 'hypothesis', 'chemical', 'physical', 'biological', 'reaction'],
      language: ['grammar', 'vocabulary', 'sentence', 'paragraph', 'essay', 'comprehension']
    };
    
    for (const [domain, keywords] of Object.entries(domains)) {
      if (keywords.some(k => statement.includes(k))) {
        return domain;
      }
    }
    return 'general';
  }

  private extractActionVerbs(statement: string): string[] {
    const verbs = ['calculate', 'analyze', 'evaluate', 'create', 'design', 'explain', 'describe', 'compare', 'contrast'];
    return verbs.filter(v => statement.includes(v));
  }

  private analyzeOptionConsistency(options: any[]): number {
    if (options.length < 2) return 0;
    const hasMarkers = options.every(o => /^[A-D]\)|^\(A-D\)|^[1-4]\)/i.test(o.text));
    const sameLength = options.every(o => Math.abs(o.text.length - options[0].text.length) < 20);
    return (hasMarkers ? 0.5 : 0) + (sameLength ? 0.3 : 0) + 0.2;
  }

  private analyzeContextDepth(question: QuestionObject): number {
    let depth = 0;
    if (question.table) depth += 1;
    if (question.diagram) depth += 1;
    if (question.code) depth += 1;
    if (question.equations?.length) depth += 1;
    if (question.passage) depth += 1;
    return Math.min(3, depth);
  }

  private analyzeFormatting(text: string): string {
    if (text.includes('**') || text.includes('__')) return 'markdown';
    if (text.includes('<') && text.includes('>')) return 'html';
    return 'plain';
  }

  private detectIntent(statement: string): string {
    if (statement.includes('remember') || statement.includes('recall') || statement.includes('identify')) {
      return 'recall';
    }
    if (statement.includes('explain') || statement.includes('describe') || statement.includes('summarize')) {
      return 'comprehension';
    }
    if (statement.includes('apply') || statement.includes('use') || statement.includes('calculate')) {
      return 'application';
    }
    if (statement.includes('analyze') || statement.includes('compare') || statement.includes('examine')) {
      return 'analysis';
    }
    if (statement.includes('evaluate') || statement.includes('assess') || statement.includes('judge')) {
      return 'evaluation';
    }
    if (statement.includes('create') || statement.includes('design') || statement.includes('develop')) {
      return 'creation';
    }
    return 'unknown';
  }

  private detectCognitiveLevel(statement: string): string {
    return this.detectIntent(statement);
  }

  /**
   * Refine question type based on structural topology and semantics
   */
  private refineQuestionType(question: QuestionObject): QuestionType {
    const statement = (question.statement || '').toLowerCase();
    const options = question.options || [];

    // If options are present, preserve choice type (MCQ, MSQ, T/F)
    if (options.length > 0) {
      if (options.length === 2) {
        const optionTexts = options.map(o => o.text.toLowerCase());
        if (optionTexts.some(t => t === 'true' || t === 'yes') && optionTexts.some(t => t === 'false' || t === 'no')) {
          return 'true_false';
        }
      }
      const correctCount = options.filter(o => o.isCorrect).length;
      if (correctCount > 1 || statement.includes('select all') || statement.includes('which of the following are') || statement.includes('multiple correct')) {
        return 'multiple_select';
      }
      return 'multiple_choice';
    }

    // Structural precedence checks for non-option questions
    if (question.table || (question.metadata as any)?.table) {
      return 'table_question' as any;
    }

    if (statement.includes('match') || statement.includes('column a') || (question.metadata as any)?.matchingPairs?.length) {
      return 'matching';
    }

    if (statement.includes('order') || statement.includes('sequence') || statement.includes('arrange') || (question.metadata as any)?.orderingItems?.length) {
      return 'ordering';
    }

    if (question.code || (question.metadata as any)?.code) {
      return 'coding';
    }

    if (question.equations && question.equations.length > 0) {
      return 'equation_question' as any;
    }

    if (question.diagram || (question.metadata as any)?.diagram) {
      return 'diagram_question' as any;
    }

    if (question.passage || (question.metadata as any)?.passage) {
      if (statement.includes('case study')) return 'case_study';
      return 'reading_comprehension';
    }

    if (statement.includes('_____') || statement.includes('___') || statement.includes('[blank]')) {
      return 'fill_blank';
    }

    if (statement.includes('explain') || statement.includes('describe') || statement.includes('discuss') || statement.includes('long answer')) {
      return 'long_answer';
    }

    return 'short_answer';
  }

  /**
   * Estimate difficulty
   */
  private estimateDifficulty(question: QuestionObject): Difficulty {
    let difficultyScore = 0;

    // Statement length
    if (question.statement.length > 200) difficultyScore += 1;
    if (question.statement.length > 400) difficultyScore += 1;

    // Number of options
    const optionCount = question.options?.length || 0;
    if (optionCount > 4) difficultyScore += 1;

    // Presence of complex elements
    if (question.diagram) difficultyScore += 1;
    if (question.table) difficultyScore += 1;
    if (question.equations && question.equations.length > 0) difficultyScore += 1;
    if (question.code) difficultyScore += 2;

    // Question type
    if (question.type === 'coding' || question.type === 'mathematical') difficultyScore += 2;
    if (question.type === 'case_study') difficultyScore += 1;

    // Bloom's level (will be classified separately, but influences difficulty)
    if (question.metadata.bloomLevel === 'L5' || question.metadata.bloomLevel === 'L6') {
      difficultyScore += 1;
    }

    // Map score to difficulty
    if (difficultyScore <= 2) return 'easy';
    if (difficultyScore <= 4) return 'medium';
    return 'hard';
  }

  /**
   * Classify Bloom's level
   */
  private classifyBloomLevel(question: QuestionObject): BloomLevel {
    const statement = question.statement.toLowerCase();

    // L1: Remember - recall facts
    if (statement.includes('what is') || statement.includes('define') || statement.includes('list') || statement.includes('name')) {
      return 'L1';
    }

    // L2: Understand - explain concepts
    if (statement.includes('explain') || statement.includes('describe') || statement.includes('summarize') || statement.includes('interpret')) {
      return 'L2';
    }

    // L3: Apply - use knowledge
    if (statement.includes('apply') || statement.includes('use') || statement.includes('solve') || statement.includes('calculate')) {
      return 'L3';
    }

    // L4: Analyze - break down
    if (statement.includes('analyze') || statement.includes('compare') || statement.includes('distinguish') || statement.includes('examine')) {
      return 'L4';
    }

    // L5: Evaluate - judge
    if (statement.includes('evaluate') || statement.includes('assess') || statement.includes('critique') || statement.includes('justify')) {
      return 'L5';
    }

    // L6: Create - create something new
    if (statement.includes('create') || statement.includes('design') || statement.includes('develop') || statement.includes('construct')) {
      return 'L6';
    }

    // Default to L2 (Understand)
    return 'L2';
  }

  /**
   * Extract skills
   */
  private extractSkills(question: QuestionObject): string[] {
    const skills: string[] = [];
    const statement = question.statement.toLowerCase();

    // Domain-specific skills
    if (statement.includes('calculate') || statement.includes('solve')) skills.push('calculation');
    if (statement.includes('analyze') || statement.includes('compare')) skills.push('analysis');
    if (statement.includes('interpret') || statement.includes('explain')) skills.push('interpretation');
    if (statement.includes('identify') || statement.includes('recognize')) skills.push('identification');
    if (statement.includes('classify') || statement.includes('categorize')) skills.push('classification');

    // Type-specific skills
    if (question.type === 'coding') skills.push('programming');
    if (question.type === 'mathematical') skills.push('mathematical_reasoning');
    if (question.type === 'diagram_based') skills.push('visual_interpretation');
    if (question.type === 'case_study') skills.push('critical_thinking');

    return skills;
  }

  /**
   * Refine topic
   */
  private refineTopic(question: QuestionObject): string {
    // Use current section from working memory if available
    if (this.workingMemory.context.currentSection) {
      return this.workingMemory.context.currentSection;
    }

    // Extract from question statement
    const statement = question.statement.toLowerCase();
    const topicKeywords = ['mathematics', 'science', 'history', 'geography', 'physics', 'chemistry', 'biology', 'english', 'computer'];

    for (const keyword of topicKeywords) {
      if (statement.includes(keyword)) {
        return keyword.charAt(0).toUpperCase() + keyword.slice(1);
      }
    }

    // Default to General
    return 'General';
  }

  /**
   * Extract subtopic
   */
  private extractSubtopic(question: QuestionObject): string {
    const statement = question.statement.toLowerCase();

    // Look for specific subtopics
    if (statement.includes('algebra') || statement.includes('equation')) return 'Algebra';
    if (statement.includes('geometry') || statement.includes('shape')) return 'Geometry';
    if (statement.includes('calculus') || statement.includes('derivative')) return 'Calculus';
    if (statement.includes('force') || statement.includes('motion')) return 'Mechanics';
    if (statement.includes('cell') || statement.includes('organism')) return 'Biology';
    if (statement.includes('atom') || statement.includes('molecule')) return 'Chemistry';

    return '';
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
