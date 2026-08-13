export type {
  AiAssessmentConfig,
  AiSourceType,
  AiGeneratedQuestion,
  AiGenerationSummary,
  AiGenerationPreview,
  AiJobStatusResponse,
} from "./types";

export {
  AI_SOURCES,
  QUICK_ACTIONS,
  SMART_PROMPTS,
  QUESTION_TYPE_OPTIONS,
  DIFFICULTY_OPTIONS,
  BLOOM_OPTIONS,
  TONE_OPTIONS,
  COUNT_PRESETS,
  GENERATION_STAGES,
  EXAM_TYPES,
  AUDIENCE_OPTIONS,
} from "./constants";

export {
  startAiGeneration,
  pollAiJob,
  commitAiToQuiz,
} from "./api";

export { useAiAssessmentStore } from "./store";
export { useAiCopilot } from "./useAiCopilot";
export { useAiGeneration } from "./useAiGeneration";
export { parseApiError, getDocumentationUrl } from "./ErrorMapper";
export type { AiErrorPayload, AiErrorType } from "./ApiError";
export { generateOfflineDemoQuestions, generateOfflineDemoPreview } from "./aiOfflineGenerator";
export { analyzeAssessment, getContextualSuggestions, computeQualityBreakdown } from "./assessmentAnalyzer";
export { parseCopilotCommand } from "./commandParser";
export {
  runCopilotCommand,
  runCopilotAction,
  streamCopilotCommand,
} from "./copilotApi";
export type {
  CopilotIntent,
  ParsedCopilotCommand,
  AiAssessmentInsights,
  AiQualityBreakdown,
  AiVersionSnapshot,
  AiQuestionComparison,
  CopilotMessage,
} from "./copilotTypes";
