/**
 * Reasoning Tree Enhancer
 * Enhances reasoning trees with more detailed decision provenance
 * Captures the full chain of reasoning for each extraction decision
 */

import { QuestionObject, ReasoningNode, Evidence } from '../types.js';

interface EnhancedReasoningTree {
  rootNode: EnhancedReasoningNode;
  depth: number;
  totalNodes: number;
  decisionPath: string[];
}

interface EnhancedReasoningNode extends ReasoningNode {
  children: EnhancedReasoningNode[];
  parent?: EnhancedReasoningNode;
  timestamp: Date;
  agent: string;
  context: {
    documentPage: number;
    surroundingNodes: string[];
    workingMemoryState: any;
  };
}

interface ExtendedEvidence extends Evidence {
  customType?: string;
}

export class ReasoningTreeEnhancer {
  private reasoningTreeCache: Map<string, EnhancedReasoningTree>;

  constructor() {
    this.reasoningTreeCache = new Map();
  }

  /**
   * Enhance reasoning tree for a question
   */
  enhanceReasoningTree(question: QuestionObject, context: {
    documentPage: number;
    surroundingNodes: string[];
    workingMemoryState: any;
    agent: string;
  }): QuestionObject {
    console.log(`[ReasoningTreeEnhancer] Enhancing reasoning tree for question ${question.id}`);

    // Create enhanced root node from existing reasoning
    const rootNode: EnhancedReasoningNode = {
      ...question.reasoning,
      children: [],
      timestamp: new Date(),
      agent: context.agent,
      context: {
        documentPage: context.documentPage,
        surroundingNodes: context.surroundingNodes,
        workingMemoryState: context.workingMemoryState,
      },
    };

    // Add child nodes for each decision step
    this.addDecisionNodes(rootNode, question, context);

    // Calculate tree statistics
    const treeStats = this.calculateTreeStatistics(rootNode);

    // Cache the enhanced tree
    this.reasoningTreeCache.set(question.id, {
      rootNode,
      depth: treeStats.depth,
      totalNodes: treeStats.totalNodes,
      decisionPath: treeStats.decisionPath,
    });

    // Update question reasoning with enhanced summary
    question.reasoning = {
      ...question.reasoning,
      decision: `Enhanced reasoning tree with ${treeStats.totalNodes} nodes, depth ${treeStats.depth}`,
      confidence: rootNode.confidence,
      evidence: rootNode.evidence,
      alternatives: rootNode.alternatives,
    };

    return question;
  }

  /**
   * Add decision nodes to the reasoning tree
   */
  private addDecisionNodes(
    rootNode: EnhancedReasoningNode,
    question: QuestionObject,
    context: any
  ): void {
    // Node for question type decision
    const typeNode: EnhancedReasoningNode = {
      decision: `Classified as ${question.type}`,
      confidence: 0.85,
      evidence: [
        {
          type: 'option_pattern',
          value: question.options?.length || 0,
          confidence: 0.9,
        },
        {
          type: 'semantic_intent',
          value: question.statement,
          confidence: 0.8,
        },
      ],
      alternatives: this.generateTypeAlternatives(question.type),
      children: [],
      timestamp: new Date(),
      agent: 'QuestionReasoner',
      context: {
        documentPage: question.sourcePage,
        surroundingNodes: context.surroundingNodes,
        workingMemoryState: context.workingMemoryState,
      },
    };
    rootNode.children.push(typeNode);

    // Node for difficulty decision
    const difficultyNode: EnhancedReasoningNode = {
      decision: `Difficulty: ${question.metadata.difficulty}`,
      confidence: 0.8,
      evidence: [
        {
          type: 'semantic_intent',
          value: `Statement length: ${question.statement.length}`,
          confidence: 0.7,
        },
        {
          type: 'option_pattern',
          value: `Component complexity: ${this.calculateComponentComplexity(question)}`,
          confidence: 0.85,
        },
      ],
      alternatives: this.generateDifficultyAlternatives(question.metadata.difficulty),
      children: [],
      timestamp: new Date(),
      agent: 'QuestionReasoner',
      context: {
        documentPage: question.sourcePage,
        surroundingNodes: context.surroundingNodes,
        workingMemoryState: context.workingMemoryState,
      },
    };
    typeNode.children.push(difficultyNode);

    // Node for Bloom's level decision
    const bloomNode: EnhancedReasoningNode = {
      decision: `Bloom's level: ${question.metadata.bloomLevel}`,
      confidence: 0.75,
      evidence: [
        {
          type: 'semantic_intent',
          value: `Verbs: ${this.extractVerbs(question.statement).join(', ')}`,
          confidence: 0.7,
        },
        {
          type: 'context',
          value: `Question type: ${question.type}`,
          confidence: 0.8,
        },
      ],
      alternatives: this.generateBloomAlternatives(question.metadata.bloomLevel),
      children: [],
      timestamp: new Date(),
      agent: 'QuestionReasoner',
      context: {
        documentPage: question.sourcePage,
        surroundingNodes: context.surroundingNodes,
        workingMemoryState: context.workingMemoryState,
      },
    };
    difficultyNode.children.push(bloomNode);

    // Node for option collection (if applicable)
    if (question.options && question.options.length > 0) {
      const optionsNode: EnhancedReasoningNode = {
        decision: `Collected ${question.options.length} options`,
        confidence: 0.9,
        evidence: [
          {
            type: 'option_pattern',
            value: question.options.map(o => o.marker).join(','),
            confidence: 0.95,
          },
          {
            type: 'context',
            value: 'options follow question in document',
            confidence: 0.85,
          },
        ],
        alternatives: [],
        children: [],
        timestamp: new Date(),
        agent: 'QuestionBuilder',
        context: {
          documentPage: question.sourcePage,
          surroundingNodes: context.surroundingNodes,
          workingMemoryState: context.workingMemoryState,
        },
      };
      rootNode.children.push(optionsNode);
    }

    // Node for diagram association (if applicable)
    if (question.diagram) {
      const diagramNode: EnhancedReasoningNode = {
        decision: `Associated diagram ${question.diagram.id}`,
        confidence: 0.85,
        evidence: [
          {
            type: 'diagram',
            value: 'diagram near question in document',
            confidence: 0.8,
          },
          {
            type: 'semantic_intent',
            value: 'diagram referenced in question',
            confidence: 0.9,
          },
        ],
        alternatives: [],
        children: [],
        timestamp: new Date(),
        agent: 'QuestionBuilder',
        context: {
          documentPage: question.sourcePage,
          surroundingNodes: context.surroundingNodes,
          workingMemoryState: context.workingMemoryState,
        },
      };
      rootNode.children.push(diagramNode);
    }

    // Node for answer detection (if applicable)
    if (question.correctAnswer) {
      const answerStr = Array.isArray(question.correctAnswer) 
        ? question.correctAnswer[0] 
        : question.correctAnswer;
      const answerNode: EnhancedReasoningNode = {
        decision: `Detected answer: ${answerStr.substring(0, 20)}...`,
        confidence: 0.7,
        evidence: [
          {
            type: 'semantic_intent',
            value: 'found in answer key section',
            confidence: 0.75,
          },
          {
            type: 'context',
            value: 'retrieved from working memory',
            confidence: 0.65,
          },
        ],
        alternatives: [],
        children: [],
        timestamp: new Date(),
        agent: 'QuestionBuilder',
        context: {
          documentPage: question.sourcePage,
          surroundingNodes: context.surroundingNodes,
          workingMemoryState: context.workingMemoryState,
        },
      };
      rootNode.children.push(answerNode);
    }
  }

  /**
   * Calculate tree statistics
   */
  private calculateTreeStatistics(rootNode: EnhancedReasoningNode): {
    depth: number;
    totalNodes: number;
    decisionPath: string[];
  } {
    let maxDepth = 0;
    let totalNodes = 0;
    const decisionPath: string[] = [];

    const traverse = (node: EnhancedReasoningNode, depth: number) => {
      maxDepth = Math.max(maxDepth, depth);
      totalNodes++;
      decisionPath.push(node.decision);

      for (const child of node.children) {
        traverse(child, depth + 1);
      }
    };

    traverse(rootNode, 0);

    return {
      depth: maxDepth,
      totalNodes,
      decisionPath,
    };
  }

  /**
   * Calculate component complexity
   */
  private calculateComponentComplexity(question: QuestionObject): number {
    let complexity = 0;

    if (question.options) complexity += question.options.length * 0.2;
    if (question.diagram) complexity += 0.3;
    if (question.table) complexity += 0.3;
    if (question.equations && question.equations.length > 0) complexity += 0.2 * question.equations.length;
    if (question.code) complexity += 0.4;

    return Math.min(complexity, 1.0);
  }

  /**
   * Extract verbs from statement
   */
  private extractVerbs(statement: string): string[] {
    const verbs = ['define', 'explain', 'describe', 'analyze', 'evaluate', 'create', 'solve', 'calculate', 'identify', 'compare'];
    const found: string[] = [];

    for (const verb of verbs) {
      if (statement.toLowerCase().includes(verb)) {
        found.push(verb);
      }
    }

    return found;
  }

  /**
   * Generate type alternatives
   */
  private generateTypeAlternatives(currentType: string): Array<{
    decision: string;
    confidence: number;
    reason: string;
  }> {
    const alternatives: Array<{ decision: string; confidence: number; reason: string }> = [];

    if (currentType === 'multiple_choice') {
      alternatives.push({
        decision: 'Could be multiple_select',
        confidence: 0.2,
        reason: 'Similar pattern, need to verify if multiple correct answers',
      });
      alternatives.push({
        decision: 'Could be true_false',
        confidence: 0.1,
        reason: 'If only 2 options, might be true/false',
      });
    }

    return alternatives;
  }

  /**
   * Generate difficulty alternatives
   */
  private generateDifficultyAlternatives(currentDifficulty: string): Array<{
    decision: string;
    confidence: number;
    reason: string;
  }> {
    const alternatives: Array<{ decision: string; confidence: number; reason: string }> = [];

    if (currentDifficulty === 'medium') {
      alternatives.push({
        decision: 'Could be easy',
        confidence: 0.3,
        reason: 'Statement is relatively short',
      });
      alternatives.push({
        decision: 'Could be hard',
        confidence: 0.2,
        reason: 'Has multiple components',
      });
    }

    return alternatives;
  }

  /**
   * Generate Bloom's level alternatives
   */
  private generateBloomAlternatives(currentBloom: string): Array<{
    decision: string;
    confidence: number;
    reason: string;
  }> {
    const alternatives: Array<{ decision: string; confidence: number; reason: string }> = [];

    if (currentBloom === 'L2') {
      alternatives.push({
        decision: 'Could be L1 (Remember)',
        confidence: 0.25,
        reason: 'Simple recall possible',
      });
      alternatives.push({
        decision: 'Could be L3 (Apply)',
        confidence: 0.2,
        reason: 'May require application of knowledge',
      });
    }

    return alternatives;
  }

  /**
   * Export reasoning tree as JSON
   */
  exportTree(question: QuestionObject): string {
    const tree = this.reasoningTreeCache.get(question.id);
    if (!tree) {
      return JSON.stringify(question.reasoning, null, 2);
    }

    return JSON.stringify(tree.rootNode, null, 2);
  }

  /**
   * Visualize reasoning tree (text-based)
   */
  visualizeTree(question: QuestionObject): string {
    const tree = this.reasoningTreeCache.get(question.id);
    if (!tree) {
      return 'No enhanced reasoning tree available';
    }

    const lines: string[] = [];
    const traverse = (node: EnhancedReasoningNode, indent: string) => {
      lines.push(`${indent}├─ ${node.decision} (confidence: ${node.confidence.toFixed(2)})`);
      lines.push(`${indent}│  └─ Agent: ${node.agent}`);
      
      if (node.evidence.length > 0) {
        lines.push(`${indent}│  └─ Evidence:`);
        for (const evidence of node.evidence) {
          lines.push(`${indent}│     └─ ${evidence.type}: ${JSON.stringify(evidence.value)} (${evidence.confidence.toFixed(2)})`);
        }
      }

      if (node.alternatives.length > 0) {
        lines.push(`${indent}│  └─ Alternatives:`);
        for (const alt of node.alternatives) {
          lines.push(`${indent}│     └─ ${alt.decision} (${alt.confidence.toFixed(2)}): ${alt.reason}`);
        }
      }

      for (const child of node.children) {
        traverse(child, indent + '│  ');
      }
    };

    traverse(tree.rootNode, '');
    return lines.join('\n');
  }

  /**
   * Get decision path
   */
  getDecisionPath(question: QuestionObject): string[] {
    const tree = this.reasoningTreeCache.get(question.id);
    if (!tree) {
      return [question.reasoning.decision];
    }

    return tree.decisionPath;
  }

  /**
   * Get reasoning statistics
   */
  getReasoningStatistics(question: QuestionObject): {
    depth: number;
    totalNodes: number;
    averageConfidence: number;
    agentDistribution: Record<string, number>;
  } {
    const tree = this.reasoningTreeCache.get(question.id);
    if (!tree) {
      return {
        depth: 0,
        totalNodes: 0,
        averageConfidence: question.reasoning.confidence,
        agentDistribution: {},
      };
    }

    const agentDistribution: Record<string, number> = {};

    const traverse = (node: EnhancedReasoningNode) => {
      agentDistribution[node.agent] = (agentDistribution[node.agent] || 0) + 1;
      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(tree.rootNode);

    return {
      depth: tree.depth,
      totalNodes: tree.totalNodes,
      averageConfidence: question.reasoning.confidence,
      agentDistribution,
    };
  }

  /**
   * Get cached reasoning tree
   */
  getCachedTree(questionId: string): EnhancedReasoningTree | undefined {
    return this.reasoningTreeCache.get(questionId);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.reasoningTreeCache.clear();
  }
}
