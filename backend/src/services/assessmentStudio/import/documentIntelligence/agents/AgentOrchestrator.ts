/**
 * Agent Orchestrator
 * Coordinates multiple agents, manages their execution, and handles inter-agent communication
 */

import { BaseAgent } from './BaseAgent.js';
import { AgentInput, AgentOutput, DocumentGraph, WorkingMemory } from '../types.js';

export class AgentOrchestrator {
  private agents: Map<string, BaseAgent>;
  private executionHistory: Array<{
    agentName: string;
    timestamp: Date;
    success: boolean;
    duration: number;
    confidence: number;
  }>;

  constructor() {
    this.agents = new Map();
    this.executionHistory = [];
  }

  /**
   * Register an agent
   */
  registerAgent(agent: BaseAgent): void {
    const config = agent.getConfig();
    this.agents.set(config.name, agent);
    console.log(`[AgentOrchestrator] Registered agent: ${config.name}`);
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentName: string): void {
    this.agents.delete(agentName);
    console.log(`[AgentOrchestrator] Unregistered agent: ${agentName}`);
  }

  /**
   * Get an agent by name
   */
  getAgent(agentName: string): BaseAgent | undefined {
    return this.agents.get(agentName);
  }

  /**
   * Execute a single agent
   */
  async executeAgent(
    agentName: string,
    input: AgentInput
  ): Promise<AgentOutput> {
    const agent = this.agents.get(agentName);
    if (!agent) {
      throw new Error(`Agent not found: ${agentName}`);
    }

    console.log(`[AgentOrchestrator] Executing agent: ${agentName}`);
    const startTime = Date.now();

    const result = await agent.execute(input);

    const duration = Date.now() - startTime;
    this.recordExecution(agentName, result.success, duration, result.confidence);

    return result;
  }

  /**
   * Execute agents in sequence
   */
  async executeSequential(
    agentNames: string[],
    input: AgentInput
  ): Promise<Map<string, AgentOutput>> {
    const results = new Map<string, AgentOutput>();
    let currentInput = input;

    console.log(`[AgentOrchestrator] Executing ${agentNames.length} agents sequentially`);

    for (const agentName of agentNames) {
      const result = await this.executeAgent(agentName, currentInput);
      results.set(agentName, result);

      if (!result.success) {
        console.error(`[AgentOrchestrator] Agent ${agentName} failed, stopping sequence`);
        break;
      }

      // Update input for next agent with result from current agent
      currentInput = {
        ...currentInput,
        config: {
          ...currentInput.config,
          previousAgentResult: result,
        },
      };
    }

    return results;
  }

  /**
   * Execute agents in parallel
   */
  async executeParallel(
    agentNames: string[],
    input: AgentInput
  ): Promise<Map<string, AgentOutput>> {
    console.log(`[AgentOrchestrator] Executing ${agentNames.length} agents in parallel`);

    const promises = agentNames.map(async agentName => {
      const result = await this.executeAgent(agentName, input);
      return { agentName, result };
    });

    const results = await Promise.all(promises);
    const resultMap = new Map<string, AgentOutput>();

    for (const { agentName, result } of results) {
      resultMap.set(agentName, result);
    }

    return resultMap;
  }

  /**
   * Execute agents with dependency resolution
   */
  async executeWithDependencies(
    agentNames: string[],
    dependencies: Map<string, string[]>,
    input: AgentInput
  ): Promise<Map<string, AgentOutput>> {
    console.log(`[AgentOrchestrator] Executing agents with dependency resolution`);

    const results = new Map<string, AgentOutput>();
    const executed = new Set<string>();
    const inputMap = new Map<string, AgentInput>();
    inputMap.set('initial', input);

    // Topological sort based on dependencies
    const sortedAgents = this.topologicalSort(agentNames, dependencies);

    for (const agentName of sortedAgents) {
      const agentDeps = dependencies.get(agentName) || [];
      
      // Check if all dependencies are satisfied
      const depsSatisfied = agentDeps.every(dep => executed.has(dep));
      
      if (!depsSatisfied) {
        console.warn(`[AgentOrchestrator] Skipping ${agentName}: dependencies not satisfied`);
        continue;
      }

      // Get input from dependencies
      let agentInput = input;
      if (agentDeps.length > 0) {
        const depResults = agentDeps.map(dep => results.get(dep)!);
        agentInput = {
          ...input,
          config: {
            ...input.config,
            dependencyResults: depResults,
          },
        };
      }

      const result = await this.executeAgent(agentName, agentInput);
      results.set(agentName, result);
      executed.add(agentName);

      if (!result.success) {
        console.error(`[AgentOrchestrator] Agent ${agentName} failed, stopping`);
        break;
      }
    }

    return results;
  }

  /**
   * Execute agents with debate/consensus mechanism
   */
  async executeWithConsensus(
    agentNames: string[],
    input: AgentInput,
    threshold: number = 0.7
  ): Promise<{
    consensus: any;
    agreement: number;
    individualResults: Map<string, AgentOutput>;
  }> {
    console.log(`[AgentOrchestrator] Executing agents with consensus mechanism`);

    const results = await this.executeParallel(agentNames, input);
    const individualResults = new Map<string, AgentOutput>();

    // Collect results
    for (const [agentName, result] of results.entries()) {
      if (result.success) {
        individualResults.set(agentName, result);
      }
    }

    if (individualResults.size === 0) {
      return {
        consensus: null,
        agreement: 0,
        individualResults,
      };
    }

    // Calculate agreement/confidence
    const confidences = Array.from(individualResults.values()).map(r => r.confidence);
    const avgConfidence = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;

    // Simple consensus: use result with highest confidence
    const resultsArray = Array.from(individualResults.values());
    const bestResult = resultsArray.length > 0 
      ? resultsArray.reduce((best, current) => (current.confidence > best.confidence ? current : best))
      : undefined;

    return {
      consensus: bestResult?.result || null,
      agreement: avgConfidence,
      individualResults,
    };
  }

  /**
   * Topological sort for dependency resolution
   */
  private topologicalSort(
    nodes: string[],
    dependencies: Map<string, string[]>
  ): string[] {
    const sorted: string[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();

    const visit = (node: string) => {
      if (temp.has(node)) {
        throw new Error(`Cycle detected in dependencies involving ${node}`);
      }
      if (visited.has(node)) {
        return;
      }

      temp.add(node);

      const deps = dependencies.get(node) || [];
      for (const dep of deps) {
        visit(dep);
      }

      temp.delete(node);
      visited.add(node);
      sorted.push(node);
    };

    for (const node of nodes) {
      if (!visited.has(node)) {
        visit(node);
      }
    }

    return sorted;
  }

  /**
   * Record agent execution
   */
  private recordExecution(
    agentName: string,
    success: boolean,
    duration: number,
    confidence: number
  ): void {
    this.executionHistory.push({
      agentName,
      timestamp: new Date(),
      success,
      duration,
      confidence,
    });
  }

  /**
   * Get execution history
   */
  getExecutionHistory(): Array<{
    agentName: string;
    timestamp: Date;
    success: boolean;
    duration: number;
    confidence: number;
  }> {
    return this.executionHistory;
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalAgents: number;
    totalExecutions: number;
    successRate: number;
    averageDuration: number;
    averageConfidence: number;
  } {
    const totalExecutions = this.executionHistory.length;
    const successfulExecutions = this.executionHistory.filter(e => e.success).length;
    const totalDuration = this.executionHistory.reduce((sum, e) => sum + e.duration, 0);
    const totalConfidence = this.executionHistory.reduce((sum, e) => sum + e.confidence, 0);

    return {
      totalAgents: this.agents.size,
      totalExecutions,
      successRate: totalExecutions > 0 ? successfulExecutions / totalExecutions : 0,
      averageDuration: totalExecutions > 0 ? totalDuration / totalExecutions : 0,
      averageConfidence: totalExecutions > 0 ? totalConfidence / totalExecutions : 0,
    };
  }

  /**
   * Clear execution history
   */
  clearHistory(): void {
    this.executionHistory = [];
    console.log('[AgentOrchestrator] Execution history cleared');
  }

  /**
   * Reset orchestrator
   */
  reset(): void {
    this.agents.clear();
    this.executionHistory = [];
    console.log('[AgentOrchestrator] Reset');
  }
}
