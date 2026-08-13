import type { AiAssessmentConfig, AiGeneratedQuestion } from "../../assessmentStudio/aiAssessment/types.js";

export type AiProviderId = "ollama" | "openai" | "gemini" | "claude" | "azure_openai" | "mock";

export interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiCompletionOptions {
  model?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  jsonMode?: boolean;
  onToken?: (token: string) => void;
  onStage?: (message: string) => void;
}

import type { ModelResolution } from "../AiModelManager.js";

export interface AiCompletionResult {
  content: string;
  tokens?: number;
  model: string;
  provider: AiProviderId;
  durationMs: number;
  modelResolution?: ModelResolution;
}

export interface AiHealthStatus {
  healthy: boolean;
  provider: AiProviderId;
  model?: string;
  message: string;
  models?: string[];
  streaming?: boolean;
  gpuAvailable?: boolean;
  memoryUsageMb?: number;
}

export interface GenerateAssessmentInput {
  content: string;
  config: AiAssessmentConfig;
  options?: AiCompletionOptions;
  context?: { jobId?: string; requestId?: string };
}

export interface QuestionActionInput {
  action: string;
  question: AiGeneratedQuestion;
  config: AiAssessmentConfig;
  options?: AiCompletionOptions;
}

export interface AIProvider {
  readonly id: AiProviderId;
  readonly name: string;
  healthCheck(): Promise<AiHealthStatus>;
  chat(messages: AiChatMessage[], options?: AiCompletionOptions): Promise<AiCompletionResult>;
  generateAssessment(input: GenerateAssessmentInput): Promise<AiGeneratedQuestion[]>;
  improveQuestion(input: QuestionActionInput): Promise<AiGeneratedQuestion>;
  rewriteQuestion(input: QuestionActionInput): Promise<AiGeneratedQuestion>;
  generateHints(input: QuestionActionInput): Promise<AiGeneratedQuestion>;
  generateExplanation(input: QuestionActionInput): Promise<AiGeneratedQuestion>;
  translate(input: QuestionActionInput & { language: string }): Promise<AiGeneratedQuestion>;
  generateSimilar(input: QuestionActionInput): Promise<AiGeneratedQuestion>;
  generateCodingQuestion(input: QuestionActionInput): Promise<AiGeneratedQuestion>;
  generateCaseStudy(input: QuestionActionInput): Promise<AiGeneratedQuestion>;
}

export interface ProviderBenchmark {
  provider: AiProviderId;
  model: string;
  requests: number;
  successes: number;
  successRate: number;
  avgResponseMs: number;
  streamingEnabled: boolean;
  tokenEstimate: number;
  gpuStatus?: string;
  ramUsageMb?: number;
}
