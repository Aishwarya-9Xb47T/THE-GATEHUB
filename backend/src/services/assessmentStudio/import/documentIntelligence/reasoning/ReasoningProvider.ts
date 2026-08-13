/**
 * Model Abstraction Layer — Reasoning Provider
 * Universal provider interface decoupling the extraction pipeline from 
 * underlying LLM providers (Gemini, OpenAI, Claude, Local LLM).
 */

export interface ReasoningRequest {
  task: 'question_reasoning' | 'graph_repair' | 'boundary_disambiguation' | 'caption_association';
  prompt: string;
  contextNodes: any[];
  maxTokens?: number;
  temperature?: number;
}

export interface ReasoningResponse {
  result: any;
  explanation: string;
  confidence: number;
  provider: string;
  model: string;
  tokensUsed?: number;
}

export interface IReasoningProvider {
  name: string;
  isAvailable(): boolean;
  executeReasoning(request: ReasoningRequest): Promise<ReasoningResponse>;
}

export class ReasoningProviderRegistry {
  private static providers: Map<string, IReasoningProvider> = new Map();
  private static defaultProviderName: string = 'rule_based_fallback';

  static registerProvider(provider: IReasoningProvider): void {
    this.providers.set(provider.name, provider);
    console.log(`[ReasoningProviderRegistry] Registered provider: ${provider.name}`);
  }

  static getProvider(name?: string): IReasoningProvider | null {
    const providerName = name || this.defaultProviderName;
    return this.providers.get(providerName) || null;
  }

  static setDefaultProvider(name: string): void {
    this.defaultProviderName = name;
  }
}
