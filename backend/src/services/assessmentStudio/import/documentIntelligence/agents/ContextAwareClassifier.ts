/**
 * Context-Aware Classification System
 * Integrates multiple agents and working memory for sophisticated classification
 */

import { DocumentGraph } from '../DocumentGraph.js';
import { WorkingMemory } from '../types.js';
import { LayoutExpertAgent } from './LayoutExpertAgent.js';
import { SemanticReaderAgent } from './SemanticReaderAgent.js';
import { AgentMemoryIntegration } from './AgentMemoryIntegration.js';
import { AgentOrchestrator } from './AgentOrchestrator.js';
import { AgentInput } from '../types.js';

export class ContextAwareClassifier {
  private documentGraph: DocumentGraph;
  private workingMemory: WorkingMemory;
  private orchestrator: AgentOrchestrator;
  private memoryIntegration: AgentMemoryIntegration;

  constructor(documentGraph: DocumentGraph, workingMemory: WorkingMemory) {
    this.documentGraph = documentGraph;
    this.workingMemory = workingMemory;
    this.orchestrator = new AgentOrchestrator();
    this.memoryIntegration = new AgentMemoryIntegration(workingMemory);

    // Register agents
    this.orchestrator.registerAgent(new LayoutExpertAgent());
    this.orchestrator.registerAgent(new SemanticReaderAgent());
  }

  /**
   * Run complete context-aware classification
   */
  async classify(): Promise<{
    success: boolean;
    layoutAnalysis?: any;
    semanticClassification?: any;
    memoryStatistics?: any;
    error?: string;
  }> {
    try {
      console.log('[ContextAwareClassifier] Starting context-aware classification');

      // Prepare agent input
      const input: AgentInput = {
        documentGraph: this.documentGraph.toSerializable(),
        workingMemory: this.workingMemory,
        config: {},
      };

      // Execute agents in sequence
      const results = await this.orchestrator.executeSequential(
        ['LayoutExpert', 'SemanticReader'],
        input
      );

      // Get layout analysis result
      const layoutResult = results.get('LayoutExpert');
      const semanticResult = results.get('SemanticReader');

      // Update working memory based on classifications
      if (semanticResult?.success && semanticResult.result) {
        this.updateMemoryFromClassification(semanticResult.result);
      }

      // Get memory statistics
      const memoryStatistics = this.memoryIntegration.getStatistics();

      console.log('[ContextAwareClassifier] Classification complete');

      return {
        success: true,
        layoutAnalysis: layoutResult?.result,
        semanticClassification: semanticResult?.result,
        memoryStatistics,
      };
    } catch (error) {
      console.error('[ContextAwareClassifier] Classification failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Update working memory from classification results
   */
  private updateMemoryFromClassification(classificationResult: any): void {
    const classifications = classificationResult.classifications;
    if (!classifications) return;

    const nodes = this.documentGraph.getAllNodes();

    for (const node of nodes) {
      const classification = classifications.get(node.id);
      if (classification) {
        this.memoryIntegration.updateMemoryFromClassification(node, classification);
      }
    }
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
   * Get orchestrator
   */
  getOrchestrator(): AgentOrchestrator {
    return this.orchestrator;
  }

  /**
   * Get memory integration
   */
  getMemoryIntegration(): AgentMemoryIntegration {
    return this.memoryIntegration;
  }

  /**
   * Get classification statistics
   */
  getStatistics(): {
    totalNodes: number;
    classifiedNodes: number;
    uncertainNodes: number;
    memoryStats: any;
  } {
    const nodes = this.documentGraph.getAllNodes();
    const memoryStats = this.memoryIntegration.getStatistics();

    return {
      totalNodes: nodes.length,
      classifiedNodes: nodes.length, // All nodes are classified
      uncertainNodes: 0, // Would be calculated from semantic result
      memoryStats,
    };
  }

  /**
   * Reset classifier
   */
  reset(): void {
    this.memoryIntegration.reset();
    this.orchestrator.clearHistory();
    console.log('[ContextAwareClassifier] Reset');
  }
}
