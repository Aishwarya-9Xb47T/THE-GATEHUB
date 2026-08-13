/**
 * Base Agent Class
 * Foundation for all specialized agents in the Document Intelligence Engine
 */

import { AgentInput, AgentOutput, AgentConfig, DocumentGraph, WorkingMemory } from '../types.js';

export abstract class BaseAgent {
  protected config: AgentConfig;
  protected documentGraph: DocumentGraph;
  protected workingMemory: WorkingMemory;

  constructor(config: AgentConfig) {
    this.config = config;
    this.documentGraph = {} as DocumentGraph;
    this.workingMemory = {
      activeQuestion: undefined,
      context: {
        currentSection: '',
        currentTopic: '',
        previousQuestions: [],
      },
      pageContext: new Map(),
    };
  }

  /**
   * Execute the agent with given input
   */
  async execute(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();

    try {
      // Set up agent state
      this.documentGraph = input.documentGraph;
      this.workingMemory = input.workingMemory;

      // Pre-execution validation
      const validationResult = this.validateInput(input);
      if (!validationResult.isValid) {
        return {
          success: false,
          confidence: 0,
          errors: validationResult.errors,
        };
      }

      // Execute agent-specific logic
      const result = await this.process(input);

      const duration = Date.now() - startTime;
      console.log(`[${this.config.name}] Execution complete in ${duration}ms`);

      return {
        success: true,
        result,
        confidence: this.calculateConfidence(result),
        metadata: {
          duration,
          agent: this.config.name,
          version: this.config.version,
        },
      };
    } catch (error) {
      console.error(`[${this.config.name}] Execution failed:`, error);
      return {
        success: false,
        confidence: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  /**
   * Validate input before processing
   */
  protected validateInput(input: AgentInput): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!input.documentGraph) {
      errors.push('Document graph is required');
    }

    if (!input.workingMemory) {
      errors.push('Working memory is required');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Agent-specific processing logic - must be implemented by subclasses
   */
  protected abstract process(input: AgentInput): Promise<any>;

  /**
   * Calculate confidence for the result
   */
  protected abstract calculateConfidence(result: any): number;

  /**
   * Get agent configuration
   */
  getConfig(): AgentConfig {
    return this.config;
  }

  /**
   * Set agent configuration
   */
  setConfig(config: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get document graph
   */
  getDocumentGraph(): DocumentGraph {
    return this.documentGraph;
  }

  /**
   * Get working memory
   */
  getWorkingMemory(): WorkingMemory {
    return this.workingMemory;
  }

  /**
   * Update working memory
   */
  updateWorkingMemory(updates: Partial<WorkingMemory>): void {
    this.workingMemory = { ...this.workingMemory, ...updates };
  }

  /**
   * Log agent message
   */
  protected log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    const prefix = `[${this.config.name}]`;
    const logMessage = `${prefix} ${message}`;

    switch (level) {
      case 'info':
        console.log(logMessage);
        break;
      case 'warn':
        console.warn(logMessage);
        break;
      case 'error':
        console.error(logMessage);
        break;
    }
  }

  /**
   * Retry logic for transient failures
   */
  protected async retry<T>(
    fn: () => Promise<T>,
    maxRetries: number = this.config.maxRetries
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.log(`Attempt ${attempt} failed: ${lastError.message}`, 'warn');

        if (attempt < maxRetries) {
          // Exponential backoff
          const delay = Math.pow(2, attempt) * 100;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }
}
